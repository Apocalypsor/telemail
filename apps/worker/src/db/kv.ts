export interface TelegramForumTopics {
  inboxTopicId: number;
  onboardedAt: number;
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

// ─── KV keys & prefixes ────────────────────────────────────────────────────

const KV_OAUTH_STATE_PREFIX = "oauth_state:";
const KV_MS_SUB_ACCOUNT_PREFIX = "ms_sub_account:";
const KV_MS_SUBSCRIPTION_PREFIX = "ms_subscription:";
const KV_OUTLOOK_FOLDERS_PREFIX = "outlook_folders:";
const KV_IMAP_LAST_UID_PREFIX = "imap:last_uid:";
const KV_IMAP_FOLDER_PREFIX = "imap:folder:";
const KV_BOT_INFO_KEY = "telegram:bot_info";
const KV_BOT_COMMANDS_VERSION_KEY = "telegram:bot_commands_version";
const KV_TELEGRAM_FORUM_TOPICS_PREFIX = "telegram:forum_topics:";
const KV_DAILY_MAIL_SUMMARY_PREFIX = "daily_mail_summary:";
const KV_THINGS_APP_INSTANCE_ID_PREFIX = "things:app_instance_id:";

// ─── TTLs ───────────────────────────────────────────────────────────────────

const OAUTH_STATE_TTL_SECONDS = 10 * 60; // 10 分钟
const BOT_INFO_TTL = 86400 * 30; // 30 天
const OUTLOOK_FOLDERS_TTL = 86400 * 30;
const DAILY_MAIL_SUMMARY_TTL = 86400 * 3; // 3 天
const IMAP_FOLDER_TTL = 86400; // 1 天

export type ImapBridgeFolderKind = "junk" | "trash" | "archive";

export interface ImapBridgeFolderState {
  hit: boolean;
  path: string | null;
}

// ─── Access Token Cache ─────────────────────────────────────────────────────

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

// ─── IMAP Bridge State ─────────────────────────────────────────────────────

export const getImapBridgeLastUid = async (
  kv: KVNamespace,
  accountId: number,
): Promise<number | null> => {
  const raw = await kv.get(`${KV_IMAP_LAST_UID_PREFIX}${accountId}`);
  return raw ? Number.parseInt(raw, 10) : null;
};

export const putImapBridgeLastUid = async (
  kv: KVNamespace,
  accountId: number,
  uid: number,
): Promise<void> => {
  await kv.put(`${KV_IMAP_LAST_UID_PREFIX}${accountId}`, String(uid));
};

export const getImapBridgeFolderPath = async (
  kv: KVNamespace,
  accountId: number,
  kind: ImapBridgeFolderKind,
): Promise<ImapBridgeFolderState> => {
  const raw = await kv.get(imapBridgeFolderKey(accountId, kind));
  if (raw === null) return { hit: false, path: null };
  return { hit: true, path: raw === "" ? null : raw };
};

export const putImapBridgeFolderPath = async (
  kv: KVNamespace,
  accountId: number,
  kind: ImapBridgeFolderKind,
  path: string | null,
): Promise<void> => {
  await kv.put(imapBridgeFolderKey(accountId, kind), path ?? "", {
    expirationTtl: IMAP_FOLDER_TTL,
  });
};

export const deleteImapBridgeFolderPaths = async (
  kv: KVNamespace,
  accountId: number,
): Promise<void> => {
  await Promise.all(
    (["junk", "trash", "archive"] as const).map((kind) =>
      kv.delete(imapBridgeFolderKey(accountId, kind)),
    ),
  );
};

const imapBridgeFolderKey = (
  accountId: number,
  kind: ImapBridgeFolderKind,
): string => `${KV_IMAP_FOLDER_PREFIX}${accountId}:${kind}`;

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

// ─── Telegram Forum Topic Onboarding ───────────────────────────────────────

export const getTelegramForumTopics = async (
  kv: KVNamespace,
  chatId: string,
): Promise<TelegramForumTopics | null> => {
  return kv.get<TelegramForumTopics>(
    `${KV_TELEGRAM_FORUM_TOPICS_PREFIX}${chatId}`,
    "json",
  );
};

export const putTelegramForumTopics = async (
  kv: KVNamespace,
  chatId: string,
  topics: TelegramForumTopics,
): Promise<void> => {
  await kv.put(
    `${KV_TELEGRAM_FORUM_TOPICS_PREFIX}${chatId}`,
    JSON.stringify(topics),
  );
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

const kvAccessTokenKey = (accountId: number): string => {
  return `access_token:${accountId}`;
};
