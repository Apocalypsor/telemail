import {
  type OriginalEmailContext,
  optimizeEmailDraft,
} from "@worker/clients/llm";
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
import type { Folder, LoadForRenderingResult } from "../mail/types";
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

    const draftBody = body.body;
    if (!draftBody.trim()) {
      return { ok: false, status: 400, error: "正文不能为空" };
    }

    const recipients = parseEmailAddressList(body.to);
    const draftHtml = markdownToHtml(draftBody);
    const textBody = replyDefaults
      ? appendReplyQuoteText(draftBody, replyDefaults.quote.text)
      : draftBody;
    const htmlBody = replyDefaults
      ? appendReplyQuoteHtml(draftHtml, replyDefaults.quote.html)
      : draftHtml;
    const input: ComposeMailInput = {
      to:
        recipients.length > 0 ? recipients : (replyDefaults?.recipients ?? []),
      subject: body.subject.trim() || replyDefaults?.subject || "",
      body: textBody,
      html: htmlBody,
    };
    if (input.to.length === 0) {
      return { ok: false, status: 400, error: "请填写有效收件人" };
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
        senderAccount?.email ?? null,
        originalContext?.context,
      );
      if (!optimized.body.trim()) {
        return { ok: false, status: 500, error: "优化失败" };
      }
      return {
        ok: true,
        data: {
          body: optimized.body.trim(),
          ...(optimized.subject ? { subject: optimized.subject } : {}),
        },
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

    return {
      ok: true,
      context: ComposeService.buildOriginalContext(original),
    };
  }

  private static buildOriginalContext(
    original: Extract<LoadForRenderingResult, { ok: true }>,
  ): OriginalEmailContext {
    let bodyMarkdown = "";
    try {
      bodyMarkdown = htmlToMarkdown(original.rawHtml);
    } catch {
      bodyMarkdown = original.rawHtml.replace(/<[^>]*>/g, " ");
    }

    const normalizedBody = bodyMarkdown.replace(/\s+\n/g, "\n").trim();
    return {
      subject: original.meta.subject ?? null,
      from: original.meta.from ?? null,
      to: original.meta.to ?? null,
      body:
        normalizedBody.length > MAX_BODY_CHARS
          ? `${normalizedBody.slice(0, MAX_BODY_CHARS)}...`
          : normalizedBody,
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
      originalContext: ComposeService.buildOriginalContext(original),
      quote: buildReplyQuote(original),
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
  | { ok: true; data: { body: string; subject?: string } }
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
    }
  | { ok: false; status: 400 | 403 | 404 | 500; error: string };

type ReplyDefaultsResult =
  | {
      ok: true;
      emailMessageId: string;
      folder: Folder;
      recipients: string[];
      subject: string;
      originalContext: OriginalEmailContext;
      quote: ReplyQuote;
    }
  | { ok: false; status: 400 | 403 | 404 | 500; error: string };

type ReplyQuote = {
  text: string;
  html: string;
};

const appendReplyQuoteText = (body: string, quote: string): string => {
  return `${body.trimEnd()}\n\n${quote}`;
};

const appendReplyQuoteHtml = (body: string, quote: string): string => {
  return `${body}${quote}`;
};

const buildReplyQuote = (
  original: Extract<LoadForRenderingResult, { ok: true }>,
): ReplyQuote => {
  const body = buildOriginalBodyMarkdown(original.rawHtml);
  const header = buildReplyQuoteHeader(original.meta);
  const text = `${header}\n${quotePlainText(body)}`;
  const html =
    `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#6b7280">` +
    `<div style="margin:0 0 12px">${escapeHtml(header)}</div>` +
    `<blockquote type="cite" style="margin:0;padding-left:12px;border-left:3px solid #d1d5db;color:#6b7280">` +
    htmlLineBreaks(body) +
    `</blockquote>` +
    `</div>`;
  return { text, html };
};

const buildReplyQuoteHeader = (
  meta: Extract<LoadForRenderingResult, { ok: true }>["meta"],
): string => {
  const from = meta.from?.trim();
  const date = formatReplyQuoteDate(meta.date);
  if (from && date) return `On ${date}, ${from} wrote:`;
  if (from) return `${from} wrote:`;
  if (date) return `On ${date}, the original sender wrote:`;
  return "Original message:";
};

const formatReplyQuoteDate = (date: Date | null | undefined): string | null => {
  if (!date || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const quotePlainText = (body: string): string => {
  return body
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
};

const htmlLineBreaks = (value: string): string => {
  return escapeHtml(value).replace(/\n/g, "<br>");
};

const escapeHtml = (value: string): string => {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
};

const buildOriginalBodyMarkdown = (html: string): string => {
  try {
    return htmlToMarkdown(html).replace(/\s+\n/g, "\n").trim();
  } catch {
    return html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+\n/g, "\n")
      .trim();
  }
};
