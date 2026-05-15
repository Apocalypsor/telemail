import { optimizeEmailDraft } from "@worker/clients/llm";
import { MAX_BODY_CHARS } from "@worker/constants";
import { getAuthorizedAccount } from "@worker/db/accounts";
import { getEmailProvider, PROVIDERS } from "@worker/providers";
import type { ComposeMailInput } from "@worker/providers/types";
import type { Env } from "@worker/types";
import { htmlToMarkdown } from "@worker/utils/mail/body";
import { markdownToHtml } from "@worker/utils/mail/markdown";
import {
  buildReplySubject,
  parseEmailAddressList,
} from "@worker/utils/mail/send";
import { reportErrorToObservability } from "@worker/utils/observability";
import type { AccountResponse } from "../accounts/model";
import { AccountsService } from "../accounts/service";
import { MailService } from "../mail/service";
import type { Folder } from "../mail/types";
import type { ComposeOptimizeBody, ComposeSendBody } from "./model";

export abstract class ComposeService {
  static async listAccounts(
    env: Env,
    userId: string,
    isAdmin: boolean,
  ): Promise<ComposeAccountsResult> {
    const result = await AccountsService.listAccounts(
      env,
      userId,
      isAdmin,
      isAdmin ? "all" : "own",
    );
    if (!result.ok) return result;
    return {
      ok: true,
      data: {
        accounts: result.data.accounts.filter(
          (account) =>
            account.canSend && account.authorized && !account.disabled,
        ),
        currentUserId: result.data.currentUserId,
        canViewAll: result.data.canViewAll,
      },
    };
  }

  static async send(
    env: Env,
    userId: string,
    isAdmin: boolean,
    body: ComposeSendBody,
  ): Promise<ComposeSendResult> {
    const account = await getAuthorizedAccount(
      env.DB,
      body.accountId,
      userId,
      isAdmin,
    );
    if (!account) {
      return { ok: false, status: 404, error: "账号不存在或无权访问" };
    }
    if (account.disabled) {
      return { ok: false, status: 400, error: "账号已暂停" };
    }

    const providerClass = PROVIDERS[account.type];
    if (!providerClass.canSend(account)) {
      return { ok: false, status: 400, error: "该账号暂不支持写邮件" };
    }
    if (providerClass.oauth && !account.refresh_token) {
      return { ok: false, status: 400, error: "账号未授权" };
    }

    const replyDefaults = body.replySource
      ? await ComposeService.resolveReplyDefaults(env, userId, isAdmin, body)
      : null;
    if (replyDefaults && !replyDefaults.ok) return replyDefaults;

    const recipients = parseEmailAddressList(body.to);
    const draftBody = body.body;
    const draftHtml = markdownToHtml(draftBody);
    const input: ComposeMailInput = {
      to:
        recipients.length > 0 ? recipients : (replyDefaults?.recipients ?? []),
      subject: body.subject.trim() || replyDefaults?.subject || "",
      body: draftBody,
      html: draftHtml,
    };
    if (input.to.length === 0) {
      return { ok: false, status: 400, error: "请填写有效收件人" };
    }
    if (!input.body.trim()) {
      return { ok: false, status: 400, error: "正文不能为空" };
    }

    try {
      const provider = getEmailProvider(account, env);
      if (replyDefaults) {
        await provider.replyToMessage(
          replyDefaults.emailMessageId,
          input,
          replyDefaults.folder,
        );
        return { ok: true, message: "回复已发送" };
      }
      await provider.sendMail(input);
      return { ok: true, message: "邮件已发送" };
    } catch (err) {
      await reportErrorToObservability(env, "compose.send_failed", err, {
        accountId: account.id,
        reply: !!replyDefaults,
      });
      return { ok: false, status: 500, error: "发送失败" };
    }
  }

  static async optimize(
    env: Env,
    userId: string,
    isAdmin: boolean,
    body: ComposeOptimizeBody,
  ): Promise<ComposeOptimizeResult> {
    if (!env.LLM_API_URL || !env.LLM_API_KEY || !env.LLM_MODEL) {
      return { ok: false, status: 500, error: "LLM not configured" };
    }

    const draft = body.body.trim();
    if (!draft) {
      return { ok: false, status: 400, error: "正文不能为空" };
    }

    const senderAccount = body.accountId
      ? await getAuthorizedAccount(env.DB, body.accountId, userId, isAdmin)
      : null;
    if (body.accountId && !senderAccount) {
      return { ok: false, status: 404, error: "账号不存在或无权访问" };
    }

    const originalContext = body.replySource
      ? await ComposeService.resolveOriginalContextForOptimize(
          env,
          userId,
          isAdmin,
          body,
        )
      : null;
    if (originalContext && !originalContext.ok) return originalContext;

    try {
      const optimized = await optimizeEmailDraft(
        env.LLM_API_URL,
        env.LLM_API_KEY,
        env.LLM_MODEL,
        body.subject?.trim() ?? "",
        draft,
        body.replyMode === true,
        senderAccount?.email ?? originalContext?.senderEmail ?? null,
        originalContext?.context,
      );
      if (!optimized.trim()) {
        return { ok: false, status: 500, error: "优化失败" };
      }
      return {
        ok: true,
        data: { body: optimized.trim() },
      };
    } catch (err) {
      await reportErrorToObservability(env, "compose.optimize_failed", err, {
        reply: body.replyMode === true,
      });
      return { ok: false, status: 500, error: "优化失败" };
    }
  }

  private static async resolveOriginalContextForOptimize(
    env: Env,
    userId: string,
    isAdmin: boolean,
    body: ComposeOptimizeBody,
  ): Promise<OriginalContextResult> {
    if (!body.accountId) {
      return { ok: false, status: 400, error: "缺少回复账号" };
    }

    const source = body.replySource;
    if (!source) {
      return { ok: false, status: 400, error: "缺少原邮件信息" };
    }

    const ctx = await MailService.resolveContext(
      env,
      body.accountId,
      source.emailMessageId,
      source.token,
    );
    if (!ctx.ok) return { ok: false, status: ctx.status, error: ctx.error };
    if (!isAdmin && ctx.account.telegram_user_id !== userId) {
      return { ok: false, status: 403, error: "Forbidden" };
    }

    const original = await MailService.loadForRendering(
      env,
      ctx.account,
      ctx.emailMessageId,
      source.folder,
    );
    if (!original.ok) {
      return { ok: false, status: original.status, error: "原邮件不可用" };
    }

    let bodyMarkdown = "";
    try {
      bodyMarkdown = htmlToMarkdown(original.rawHtml);
    } catch {
      bodyMarkdown = original.rawHtml.replace(/<[^>]*>/g, " ");
    }

    const normalizedBody = bodyMarkdown.replace(/\s+\n/g, "\n").trim();
    return {
      ok: true,
      context: {
        subject: original.meta.subject ?? null,
        from: original.meta.from ?? null,
        to: original.meta.to ?? null,
        body:
          normalizedBody.length > MAX_BODY_CHARS
            ? `${normalizedBody.slice(0, MAX_BODY_CHARS)}...`
            : normalizedBody,
      },
      senderEmail: ctx.account.email ?? null,
    };
  }

  private static async resolveReplyDefaults(
    env: Env,
    userId: string,
    isAdmin: boolean,
    body: ComposeSendBody,
  ): Promise<ReplyDefaultsResult> {
    const source = body.replySource;
    if (!source) return { ok: false, status: 400, error: "缺少原邮件信息" };

    const ctx = await MailService.resolveContext(
      env,
      body.accountId,
      source.emailMessageId,
      source.token,
    );
    if (!ctx.ok) return { ok: false, status: ctx.status, error: ctx.error };
    if (!isAdmin && ctx.account.telegram_user_id !== userId) {
      return { ok: false, status: 403, error: "Forbidden" };
    }

    const original = await MailService.loadForRendering(
      env,
      ctx.account,
      ctx.emailMessageId,
      source.folder,
    );
    if (!original.ok) {
      return { ok: false, status: original.status, error: "原邮件不可用" };
    }

    return {
      ok: true,
      emailMessageId: ctx.emailMessageId,
      folder: original.fetchFolder,
      recipients: original.replyRecipients,
      subject: buildReplySubject(original.meta.subject),
    };
  }
}

type ComposeSendResult =
  | { ok: true; message: string }
  | { ok: false; status: 400 | 403 | 404 | 500; error: string };

type ComposeAccountsResult =
  | {
      ok: true;
      data: {
        accounts: AccountResponse[];
        currentUserId: string;
        canViewAll: boolean;
      };
    }
  | { ok: false; status: number; error: string };

type ComposeOptimizeResult =
  | { ok: true; data: { body: string } }
  | { ok: false; status: 400 | 403 | 404 | 500; error: string };

type OriginalContextResult =
  | {
      ok: true;
      context: {
        subject: string | null;
        from: string | null;
        to: string | null;
        body: string;
      };
      senderEmail: string | null;
    }
  | { ok: false; status: 400 | 403 | 404 | 500; error: string };

type ReplyDefaultsResult =
  | {
      ok: true;
      emailMessageId: string;
      folder: Folder;
      recipients: string[];
      subject: string;
    }
  | { ok: false; status: 400 | 403 | 404 | 500; error: string };
