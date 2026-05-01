/** Mail 模块的业务用例编排 —— 跨 token / DB / KV / provider / HTML 处理几个子系统。
 *  按 [Elysia best-practice](https://elysiajs.com/essential/best-practice.html#service)
 *  非 request-dependent service 形态：`abstract class` + static method，
 *  调用方 `MailService.foo(env, ...)`。不实例化、不持状态。 */
import { analyzeEmail } from "@worker/clients/llm";
import { getAccountById } from "@worker/db/accounts";
import { getCachedMailData, putCachedMailData } from "@worker/db/kv";
import {
  getMappingsByEmailIds,
  updateShortSummary,
} from "@worker/db/message-map";
import { getEmailProvider, PROVIDERS } from "@worker/providers";
import type { Account, Env } from "@worker/types";
import { htmlToMarkdown } from "@worker/utils/format";
import { proxyImages, replaceCidReferences } from "@worker/utils/mail-html";
import {
  generateMailTokenById,
  verifyMailTokenById,
} from "@worker/utils/mail-token";
import { reportErrorToObservability } from "@worker/utils/observability";
import type {
  Folder,
  LoadForRenderingResult,
  LookupContextResult,
  ResolveContextResult,
} from "./types";

export abstract class MailService {
  /**
   * 三元组 (accountId, emailMessageId, token) 的 HMAC 校验 + 账号存在校验。
   *
   * - mail preview GET：纯 token 鉴权（持 token = 有权看），handler 后续不再叠 owner check
   * - mail mutations / reminders：在 session/miniapp auth 之后再叠这个三元组校验邮件归属
   *
   * 入参全用 unknown —— route param / query / body 三种来源都包；handler 拿到的可能是
   * `string | string[] | undefined`，统一在这里 narrow 并报 400。
   */
  static async resolveContext(
    env: Env,
    accountIdRaw: unknown,
    emailMessageIdRaw: unknown,
    tokenRaw: unknown,
  ): Promise<ResolveContextResult> {
    const accountId =
      typeof accountIdRaw === "number" ? accountIdRaw : Number(accountIdRaw);
    if (!Number.isInteger(accountId) || accountId <= 0)
      return { ok: false, status: 400, error: "Invalid accountId" };
    if (typeof emailMessageIdRaw !== "string" || !emailMessageIdRaw)
      return { ok: false, status: 400, error: "Invalid emailMessageId" };
    if (typeof tokenRaw !== "string" || !tokenRaw)
      return { ok: false, status: 400, error: "Invalid token" };

    const valid = await verifyMailTokenById(
      env.ADMIN_SECRET,
      emailMessageIdRaw,
      accountId,
      tokenRaw,
    );
    if (!valid) return { ok: false, status: 403, error: "Forbidden" };

    const account = await getAccountById(env.DB, accountId);
    if (!account) return { ok: false, status: 404, error: "Account not found" };
    return {
      ok: true,
      account,
      accountId,
      emailMessageId: emailMessageIdRaw,
      token: tokenRaw,
    };
  }

  /** 拿邮件渲染所需的全部数据：folder 推断 → KV 缓存命中或 provider 现拉
   *  → CID 内联 → 写回 KV → 图片代理。GET /api/mail/:id handler 唯一 caller。 */
  static async loadForRendering(
    env: Env,
    account: Account,
    emailMessageId: string,
    folderHint?: string,
  ): Promise<LoadForRenderingResult> {
    const provider = getEmailProvider(account, env);
    // hint 给定就直接信，省一次 isJunk —— hint 没传才回退用 isJunk 自动判断
    const inJunk =
      folderHint === "junk"
        ? true
        : folderHint === "archive" || folderHint === "inbox"
          ? false
          : await provider.isJunk(emailMessageId).catch(() => false);
    const fetchFolder: Folder =
      folderHint === "archive" ? "archive" : inJunk ? "junk" : "inbox";
    // isStarred 需要 fetchFolder（IMAP 各 folder UID 不通用），所以排在 fetchFolder
    // 算出之后；OAuth provider 忽略 folder 参数
    const starred = await provider
      .isStarred(emailMessageId, fetchFolder)
      .catch(() => false);

    const cached = await getCachedMailData(
      env.EMAIL_KV,
      account.id,
      fetchFolder,
      emailMessageId,
    );
    if (cached) {
      return {
        ok: true,
        meta: cached.meta ?? {},
        rawHtml: cached.html,
        proxiedHtml: await proxyImages(cached.html, env.ADMIN_SECRET),
        fetchFolder,
        inJunk,
        starred,
      };
    }

    if (PROVIDERS[account.type].oauth && !account.refresh_token)
      return { ok: false, status: 403, reason: "Account not authorized" };

    const result = await provider.fetchForPreview(emailMessageId, fetchFolder);
    if (!result)
      return { ok: false, status: 404, reason: "No content in this email" };

    const html = replaceCidReferences(result.html, result.cidMap);
    await putCachedMailData(
      env.EMAIL_KV,
      account.id,
      fetchFolder,
      emailMessageId,
      { html, meta: result.meta },
    );
    return {
      ok: true,
      meta: result.meta ?? {},
      rawHtml: html,
      proxiedHtml: await proxyImages(html, env.ADMIN_SECRET),
      fetchFolder,
      inJunk,
      starred,
    };
  }

  /** 给定一封邮件，找它在 Telegram 里的位置（chat / message id）和展示用的 subject。
   *  用于群聊 deep-link、reminder 创建时回写邮件上下文等场景。
   *  subject 来源优先级：mapping.short_summary（LLM 一句话摘要）→ KV 缓存 → provider 现拉。 */
  static async lookupContext(
    env: Env,
    account: Account,
    emailMessageId: string,
  ): Promise<LookupContextResult> {
    const mappings = await getMappingsByEmailIds(env.DB, account.id, [
      emailMessageId,
    ]);
    const m = mappings[0];

    let subject: string | null = m?.short_summary ?? null;

    if (subject == null) {
      for (const folder of ["inbox", "junk", "archive"] as const) {
        const cached = await getCachedMailData(
          env.EMAIL_KV,
          account.id,
          folder,
          emailMessageId,
        );
        if (cached?.meta?.subject) {
          subject = cached.meta.subject;
          break;
        }
      }
    }

    if (subject == null) {
      const needsAuth = PROVIDERS[account.type].oauth && !account.refresh_token;
      if (!needsAuth) {
        try {
          const provider = getEmailProvider(account, env);
          const result = await provider.fetchForPreview(
            emailMessageId,
            "inbox",
          );
          if (result?.meta?.subject) {
            subject = result.meta.subject;
            await putCachedMailData(
              env.EMAIL_KV,
              account.id,
              "inbox",
              emailMessageId,
              { html: result.html, meta: result.meta },
            ).catch(() => {});
          }
        } catch {
          // 拉不到就算了，subject 留 null 由调用方决定 fallback
        }
      }
    }

    return {
      tgChatId: m?.tg_chat_id ?? null,
      tgMessageId: m?.tg_message_id ?? null,
      subject,
    };
  }

  /** 生成 (accountId, emailMessageId) 的 HMAC token —— 邮件预览 / 群聊 deep-link 等
   *  场景里把这个 token 当作"持有该邮件的查看权"。 */
  static generateToken(
    secret: string,
    emailMessageId: string,
    accountId: number,
  ): Promise<string> {
    return generateMailTokenById(secret, emailMessageId, accountId);
  }

  /** 没有 short_summary 时调 LLM 现补一份，写回 message_map。
   *  调用方应当通过 `executionCtx.waitUntil` 在响应后台跑 —— preview 接口
   *  打开邮件时若 mapping 缺 short_summary 就触发；下次列表刷新就能展示。
   *
   *  Bail 条件：LLM 未配置 / 没有 mapping（没投递过 → 没行可写） /
   *  short_summary 已存在。失败走 observability，不抛。 */
  static async ensureShortSummary(
    env: Env,
    account: Account,
    emailMessageId: string,
    subject: string | null | undefined,
    rawHtml: string,
  ): Promise<void> {
    if (!env.LLM_API_URL || !env.LLM_API_KEY || !env.LLM_MODEL) return;

    const [mapping] = await getMappingsByEmailIds(env.DB, account.id, [
      emailMessageId,
    ]);
    if (!mapping || mapping.short_summary) return;

    try {
      const body = htmlToMarkdown(rawHtml);
      if (!body.trim()) return;

      const analysis = await analyzeEmail(
        env.LLM_API_URL,
        env.LLM_API_KEY,
        env.LLM_MODEL,
        subject ?? "",
        body,
      );
      if (analysis.shortSummary) {
        await updateShortSummary(
          env.DB,
          account.id,
          emailMessageId,
          analysis.shortSummary,
        );
      }
    } catch (err) {
      await reportErrorToObservability(
        env,
        "preview.short_summary_failed",
        err,
        { accountId: account.id, emailMessageId },
      );
    }
  }
}
