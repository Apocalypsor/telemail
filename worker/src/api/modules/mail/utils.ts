import { getAccountById } from "@worker/db/accounts";
import { getCachedMailData, putCachedMailData } from "@worker/db/kv";
import { getEmailProvider, PROVIDERS } from "@worker/providers";
import type { Account, Env, MailMeta } from "@worker/types";
import { proxyImages, replaceCidReferences } from "@worker/utils/mail-html";
import { verifyMailTokenById } from "@worker/utils/mail-token";

/**
 * (emailMessageId, accountId, token) 三元组校验 —— GET 预览页和 POST 动作
 * 共用的核心逻辑。框架无关：返回 ok 或带 status 的失败结果，调用方包装成
 * Elysia status response。
 */
export async function resolveMailContext(
  env: Env,
  emailMessageId: string,
  accountIdRaw: number | string,
  token: string,
): Promise<
  | { ok: true; account: Account; emailMessageId: string; token: string }
  | { ok: false; status: 400 | 403 | 404; error: string }
> {
  const accountId =
    typeof accountIdRaw === "number" ? accountIdRaw : Number(accountIdRaw);
  if (!Number.isInteger(accountId) || accountId <= 0)
    return { ok: false, status: 400, error: "Invalid accountId" };
  if (!token) return { ok: false, status: 400, error: "Invalid token" };

  const valid = await verifyMailTokenById(
    env.ADMIN_SECRET,
    emailMessageId,
    accountId,
    token,
  );
  if (!valid) return { ok: false, status: 403, error: "Forbidden" };

  const account = await getAccountById(env.DB, accountId);
  if (!account) return { ok: false, status: 404, error: "Account not found" };
  return { ok: true, account, emailMessageId, token };
}

// ─── 邮件预览数据加载（web /mail/:id 和 mini app /telegram-app/mail/:id 共用） ─

type Folder = "inbox" | "junk" | "archive";

type LoadedMail =
  | {
      ok: true;
      meta: MailMeta;
      /** CID 内联完成、未走图片代理的原始 HTML —— 关闭代理时直接渲染 */
      rawHtml: string;
      /** 在 rawHtml 基础上再做外链图片代理改写 —— 默认渲染这个 */
      proxiedHtml: string;
      fetchFolder: Folder;
      inJunk: boolean;
      starred: boolean;
    }
  | { ok: false; status: 403 | 404; reason: string };

/** 拿邮件渲染所需的全部数据：folder 推断 → KV 缓存命中或 provider 现拉
 *  → CID 内联 → 写回 KV → 图片代理。GET /api/mail/:id handler 唯一 caller。 */
export async function loadMailForRendering(
  env: Env,
  account: Account,
  emailMessageId: string,
  folderHint?: string,
): Promise<LoadedMail> {
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
    {
      html,
      meta: result.meta,
    },
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
