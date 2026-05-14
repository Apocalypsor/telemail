import type { MailAttachmentMeta, MailMeta } from "@worker/types";
import { parseEmailDate } from "@worker/utils/mail/body";

// 30 天 —— well-known folder ID 在账号生命周期内稳定

// ─── Access Token Cache ─────────────────────────────────────────────────────

const kvAccessTokenKey = (accountId: number): string => {
  return `access_token:${accountId}`;
};

export const getCachedAccessToken = async (
  kv: KVNamespace,
  accountId: number,
): Promise<string | null> => {
  return kv.get(kvAccessTokenKey(accountId));
};

export const putCachedAccessToken = async (
  kv: KVNamespace,
  accountId: number,
  token: string,
  ttlSeconds: number,
): Promise<void> => {
  await kv.put(kvAccessTokenKey(accountId), token, {
    expirationTtl: ttlSeconds,
  });
};

export const deleteCachedAccessToken = async (
  kv: KVNamespace,
  accountId: number,
): Promise<void> => {
  await kv.delete(kvAccessTokenKey(accountId));
};

// ─── Mail HTML Cache ────────────────────────────────────────────────────────

// 同一封邮件在 INBOX / junk / archive 的渲染可能不同（folder 提示 IMAP 去哪个
// 文件夹拉 raw），所以 folder 要进 key。emailMessageId 是 provider 原生邮件 id。
const kvMailHtmlKey = (
  accountId: number,
  folder: string,
  emailMessageId: string,
): string => {
  return `mail_html:${accountId}:${folder}:${emailMessageId}`;
};

export const getCachedMailData = async (
  kv: KVNamespace,
  accountId: number,
  folder: string,
  emailMessageId: string,
): Promise<CachedMailData | null> => {
  const raw = await kv.get(kvMailHtmlKey(accountId, folder, emailMessageId));
  if (!raw) return null;
  let wire: CachedMailDataWire;
  try {
    wire = JSON.parse(raw) as CachedMailDataWire;
  } catch {
    // 兼容旧格式（纯 HTML 字符串）
    return { html: raw };
  }
  if (!wire.meta) return { html: wire.html, attachments: wire.attachments };
  const { date, ...rest } = wire.meta;
  return {
    html: wire.html,
    meta: { ...rest, date: parseEmailDate(date) },
    attachments: wire.attachments,
  };
};

export const putCachedMailData = async (
  kv: KVNamespace,
  accountId: number,
  folder: string,
  emailMessageId: string,
  data: CachedMailData,
): Promise<void> => {
  await kv.put(
    kvMailHtmlKey(accountId, folder, emailMessageId),
    JSON.stringify(data),
    { expirationTtl: MAIL_HTML_CACHE_TTL },
  );
};

// ─── OAuth State ────────────────────────────────────────────────────────────

export const putOAuthState = async (
  kv: KVNamespace,
  statePrefix: string,
  state: string,
  accountId: number,
): Promise<void> => {
  await kv.put(
    `${KV_OAUTH_STATE_PREFIX}${statePrefix}${state}`,
    String(accountId),
    { expirationTtl: OAUTH_STATE_TTL_SECONDS },
  );
};

export const getOAuthState = async (
  kv: KVNamespace,
  statePrefix: string,
  state: string,
): Promise<string | null> => {
  return kv.get(`${KV_OAUTH_STATE_PREFIX}${statePrefix}${state}`);
};

export const deleteOAuthState = async (
  kv: KVNamespace,
  statePrefix: string,
  state: string,
): Promise<void> => {
  await kv.delete(`${KV_OAUTH_STATE_PREFIX}${statePrefix}${state}`);
};

export const putOAuthBotMsg = async (
  kv: KVNamespace,
  accountId: number,
  msg: OAuthBotMsg,
): Promise<void> => {
  await kv.put(`${KV_OAUTH_BOT_MSG_PREFIX}${accountId}`, JSON.stringify(msg), {
    expirationTtl: OAUTH_STATE_TTL_SECONDS,
  });
};

export const getOAuthBotMsg = async (
  kv: KVNamespace,
  accountId: number,
): Promise<OAuthBotMsg | null> => {
  const raw = await kv.get(`${KV_OAUTH_BOT_MSG_PREFIX}${accountId}`);
  if (!raw) return null;
  return JSON.parse(raw) as OAuthBotMsg;
};

export const deleteOAuthBotMsg = async (
  kv: KVNamespace,
  accountId: number,
): Promise<void> => {
  await kv.delete(`${KV_OAUTH_BOT_MSG_PREFIX}${accountId}`);
};

// ─── Outlook Subscription ─────────────────────────────────────────────��─────

export const getMsSubscriptionId = async (
  kv: KVNamespace,
  accountId: number,
): Promise<string | null> => {
  return kv.get(`${KV_MS_SUBSCRIPTION_PREFIX}${accountId}`);
};

export const putMsSubscription = async (
  kv: KVNamespace,
  accountId: number,
  subscriptionId: string,
  ttlSeconds: number,
): Promise<void> => {
  await Promise.all([
    kv.put(`${KV_MS_SUBSCRIPTION_PREFIX}${accountId}`, subscriptionId, {
      expirationTtl: ttlSeconds,
    }),
    kv.put(`${KV_MS_SUB_ACCOUNT_PREFIX}${subscriptionId}`, String(accountId), {
      expirationTtl: ttlSeconds,
    }),
  ]);
};

export const refreshMsSubAccountMapping = async (
  kv: KVNamespace,
  subscriptionId: string,
  accountId: number,
  ttlSeconds: number,
): Promise<void> => {
  await kv.put(
    `${KV_MS_SUB_ACCOUNT_PREFIX}${subscriptionId}`,
    String(accountId),
    { expirationTtl: ttlSeconds },
  );
};

export const getMsAccountBySubscription = async (
  kv: KVNamespace,
  subscriptionId: string,
): Promise<string | null> => {
  return kv.get(`${KV_MS_SUB_ACCOUNT_PREFIX}${subscriptionId}`);
};

export const deleteMsSubscription = async (
  kv: KVNamespace,
  accountId: number,
): Promise<void> => {
  const subId = await getMsSubscriptionId(kv, accountId);
  await kv.delete(`${KV_MS_SUBSCRIPTION_PREFIX}${accountId}`);
  if (subId) {
    await kv.delete(`${KV_MS_SUB_ACCOUNT_PREFIX}${subId}`);
  }
};

export const getCachedOutlookFolderIds = async (
  kv: KVNamespace,
  accountId: number,
): Promise<OutlookFolderIds | null> => {
  return kv.get<OutlookFolderIds>(
    `${KV_OUTLOOK_FOLDERS_PREFIX}${accountId}`,
    "json",
  );
};

export const putCachedOutlookFolderIds = async (
  kv: KVNamespace,
  accountId: number,
  ids: OutlookFolderIds,
): Promise<void> => {
  await kv.put(
    `${KV_OUTLOOK_FOLDERS_PREFIX}${accountId}`,
    JSON.stringify(ids),
    { expirationTtl: OUTLOOK_FOLDERS_TTL },
  );
};

export const deleteCachedOutlookFolderIds = async (
  kv: KVNamespace,
  accountId: number,
): Promise<void> => {
  await kv.delete(`${KV_OUTLOOK_FOLDERS_PREFIX}${accountId}`);
};

// ─── Bot Info Cache ─────────────────────────────────────────────────────────

export const getCachedBotInfo = async (
  kv: KVNamespace,
): Promise<string | null> => {
  return kv.get(KV_BOT_INFO_KEY);
};

export const putCachedBotInfo = async (
  kv: KVNamespace,
  botInfo: string,
): Promise<void> => {
  await kv.put(KV_BOT_INFO_KEY, botInfo, {
    expirationTtl: BOT_INFO_TTL,
  });
};

// ─── Bot Commands Version ───────────────────────────────────────────────────

export const getBotCommandsVersion = async (
  kv: KVNamespace,
): Promise<string | null> => {
  return kv.get(KV_BOT_COMMANDS_VERSION_KEY);
};

export const putBotCommandsVersion = async (
  kv: KVNamespace,
  version: string,
): Promise<void> => {
  await kv.put(KV_BOT_COMMANDS_VERSION_KEY, version);
};

// ─── Daily Mail Summary ────────────────────────────────────────────────────

export const hasDailyMailSummaryProcessed = async (
  kv: KVNamespace,
  telegramUserId: string,
  localDate: string,
): Promise<boolean> => {
  return !!(await kv.get(
    `${KV_DAILY_MAIL_SUMMARY_PREFIX}${telegramUserId}:${localDate}`,
  ));
};

export const putDailyMailSummaryProcessed = async (
  kv: KVNamespace,
  telegramUserId: string,
  localDate: string,
): Promise<void> => {
  await kv.put(
    `${KV_DAILY_MAIL_SUMMARY_PREFIX}${telegramUserId}:${localDate}`,
    "1",
    { expirationTtl: DAILY_MAIL_SUMMARY_TTL },
  );
};

// ─── Things Cloud ───────────────────────────────────────────────────────────

export const getThingsAppInstanceId = async (
  kv: KVNamespace,
  telegramUserId: string,
): Promise<string | null> => {
  return kv.get(`${KV_THINGS_APP_INSTANCE_ID_PREFIX}${telegramUserId}`);
};

export const putThingsAppInstanceId = async (
  kv: KVNamespace,
  telegramUserId: string,
  appInstanceId: string,
): Promise<void> => {
  await kv.put(
    `${KV_THINGS_APP_INSTANCE_ID_PREFIX}${telegramUserId}`,
    appInstanceId,
  );
};

export const deleteThingsAppInstanceId = async (
  kv: KVNamespace,
  telegramUserId: string,
): Promise<void> => {
  await kv.delete(`${KV_THINGS_APP_INSTANCE_ID_PREFIX}${telegramUserId}`);
};
// ─── KV keys & prefixes ──────────────────────────────────────────────��─────

const KV_OAUTH_STATE_PREFIX = "oauth_state:";
const KV_OAUTH_BOT_MSG_PREFIX = "oauth_bot_msg:";
const KV_MS_SUB_ACCOUNT_PREFIX = "ms_sub_account:";
const KV_MS_SUBSCRIPTION_PREFIX = "ms_subscription:";
const KV_OUTLOOK_FOLDERS_PREFIX = "outlook_folders:";
const KV_BOT_INFO_KEY = "telegram:bot_info";
const KV_BOT_COMMANDS_VERSION_KEY = "telegram:bot_commands_version";
const KV_DAILY_MAIL_SUMMARY_PREFIX = "daily_mail_summary:";
const KV_THINGS_APP_INSTANCE_ID_PREFIX = "things:app_instance_id:";

// ─── TTLs ───────────────────────────────────────────────────────────────────

const MAIL_HTML_CACHE_TTL = 60 * 60 * 24 * 7; // 7 天
const OAUTH_STATE_TTL_SECONDS = 10 * 60; // 10 分钟
const BOT_INFO_TTL = 86400 * 30; // 30 天
const OUTLOOK_FOLDERS_TTL = 86400 * 30;
const DAILY_MAIL_SUMMARY_TTL = 86400 * 3; // 3 天

interface CachedMailData {
  html: string;
  meta?: MailMeta;
  attachments?: MailAttachmentMeta[];
}

/** wire 形态：JSON.stringify 把 meta.date 编成 ISO 字符串落盘，所以读回来必须先用
 *  `string` 处理、再 revive 成 Date 才符合 `MailMeta` 的类型。 */
type CachedMailDataWire = {
  html: string;
  meta?: Omit<MailMeta, "date"> & { date?: string | null };
  attachments?: MailAttachmentMeta[];
};

// ─── OAuth Bot Message (回写 Bot 消息位置) ──────────────────────────────────

interface OAuthBotMsg {
  chatId: string;
  messageId: number;
}

// ─── Outlook Well-known Folder IDs Cache ───────────────────────────────────
// Graph API 的 well-known folder name (Inbox / JunkEmail / archive / DeletedItems)
// 解析出来的 ID 在账号生命周期内稳定，存 KV 30 天，省掉 resolveMessageState/isJunk
// 每次 4 个 GET 的开销。删账号时清掉。

export interface OutlookFolderIds {
  inbox: string;
  junk: string;
  archive: string;
  deleted: string;
}
