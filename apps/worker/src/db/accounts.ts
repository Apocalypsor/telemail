import { getDb } from "@worker/db/client";
import { accounts } from "@worker/db/schema";
import type { Account, AccountType } from "@worker/types";
import { and, asc, eq } from "drizzle-orm";

export const getAllAccounts = async (d1: D1Database): Promise<Account[]> => {
  const db = getDb(d1);
  return db.select().from(accounts).orderBy(asc(accounts.id));
};

export const getAccountById = async (
  d1: D1Database,
  id: number,
): Promise<Account | null> => {
  const db = getDb(d1);
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
  return row ?? null;
};

/** 获取所有使用该 email 的账号（同一邮箱可绑定多个账号） */
export const getAccountsByEmail = async (
  d1: D1Database,
  email: string,
): Promise<Account[]> => {
  const db = getDb(d1);
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.email, email))
    .orderBy(asc(accounts.id));
};

export const getImapAccountByForwardToken = async (
  d1: D1Database,
  token: string,
): Promise<Account | null> => {
  const db = getDb(d1);
  const [row] = await db
    .select()
    .from(accounts)
    .where(
      and(eq(accounts.type, "imap"), eq(accounts.imap_forward_token, token)),
    );
  return row ?? null;
};

/** 获取用户自己绑定的账号 */
export const getOwnAccounts = async (
  d1: D1Database,
  telegramUserId: string,
): Promise<Account[]> => {
  const db = getDb(d1);
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.telegram_user_id, telegramUserId))
    .orderBy(asc(accounts.id));
};

/** 获取用户可见的账号：admin 看全部，普通用户看自己绑定的 */
export const getVisibleAccounts = async (
  d1: D1Database,
  telegramUserId: string,
  isAdmin: boolean,
): Promise<Account[]> => {
  if (isAdmin) return getAllAccounts(d1);
  return getOwnAccounts(d1, telegramUserId);
};

/** 检查用户是否有权访问指定账号，返回账号或 null */
export const getAuthorizedAccount = async (
  d1: D1Database,
  id: number,
  userId: string,
  isAdmin: boolean,
): Promise<Account | null> => {
  const account = await getAccountById(d1, id);
  if (!account) return null;
  if (isAdmin) return account;
  if (account.telegram_user_id === userId) return account;
  return null;
};

export const createAccount = async (
  d1: D1Database,
  chatId: string,
  telegramUserId: string | undefined,
  type: AccountType,
  topicId?: number | null,
): Promise<Account> => {
  const db = getDb(d1);
  const [row] = await db
    .insert(accounts)
    .values({
      type,
      chat_id: chatId,
      topic_id: topicId ?? null,
      telegram_user_id: telegramUserId ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to create account");
  return row;
};

export const deleteAccount = async (
  d1: D1Database,
  id: number,
): Promise<void> => {
  const db = getDb(d1);
  await db.delete(accounts).where(eq(accounts.id, id));
};

export const updateRefreshToken = async (
  d1: D1Database,
  id: number,
  refreshToken: string,
): Promise<void> => {
  const db = getDb(d1);
  await db
    .update(accounts)
    .set({ refresh_token: refreshToken, updated_at: new Date() })
    .where(eq(accounts.id, id));
};

export const updateAccountEmail = async (
  d1: D1Database,
  id: number,
  email: string,
): Promise<void> => {
  const db = getDb(d1);
  await db
    .update(accounts)
    .set({ email, updated_at: new Date() })
    .where(eq(accounts.id, id));
};

export const updateAccount = async (
  d1: D1Database,
  id: number,
  chatId: string,
  telegramUserId?: string | null,
  topicId?: number | null,
): Promise<void> => {
  const db = getDb(d1);
  const patch: {
    chat_id: string;
    telegram_user_id?: string | null;
    topic_id?: number | null;
    updated_at: Date;
  } = { chat_id: chatId, updated_at: new Date() };
  if (telegramUserId !== undefined) {
    patch.telegram_user_id = telegramUserId;
  }
  if (topicId !== undefined) {
    patch.topic_id = topicId;
  }
  await db.update(accounts).set(patch).where(eq(accounts.id, id));
};

/** 切换账号启用 / 禁用状态 */
export const setAccountDisabled = async (
  d1: D1Database,
  accountId: number,
  disabled: boolean,
): Promise<void> => {
  const db = getDb(d1);
  await db
    .update(accounts)
    .set({ disabled: disabled ? 1 : 0, updated_at: new Date() })
    .where(eq(accounts.id, accountId));
};

// ─── History ID ─────────────────────────────────────────────────────────────

export const getHistoryId = async (
  d1: D1Database,
  accountId: number,
): Promise<string | null> => {
  const db = getDb(d1);
  const [row] = await db
    .select({ history_id: accounts.history_id })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row?.history_id ?? null;
};

export const putHistoryId = async (
  d1: D1Database,
  accountId: number,
  historyId: string,
): Promise<void> => {
  const db = getDb(d1);
  await db
    .update(accounts)
    .set({ history_id: historyId, updated_at: new Date() })
    .where(eq(accounts.id, accountId));
};

// ─── Archive Folder ──────────────────────────────────────────────────────────

export const setArchiveFolder = async (
  d1: D1Database,
  accountId: number,
  archiveFolder: string | null,
  archiveFolderName: string | null,
): Promise<void> => {
  const db = getDb(d1);
  await db
    .update(accounts)
    .set({
      archive_folder: archiveFolder,
      archive_folder_name: archiveFolderName,
      updated_at: new Date(),
    })
    .where(eq(accounts.id, accountId));
};

/** 创建 IMAP 账号 */
export const createImapAccount = async (
  d1: D1Database,
  params: {
    chatId: string;
    topicId?: number | null;
    telegramUserId?: string;
    email: string;
    imapHost: string;
    imapPort: number;
    imapSecure: number;
    imapUser: string;
    imapPass: string;
    imapForwardToken: string;
  },
): Promise<Account> => {
  const db = getDb(d1);
  const [row] = await db
    .insert(accounts)
    .values({
      type: "imap",
      chat_id: params.chatId,
      topic_id: params.topicId ?? null,
      telegram_user_id: params.telegramUserId ?? null,
      email: params.email,
      imap_host: params.imapHost,
      imap_port: params.imapPort,
      imap_secure: params.imapSecure,
      imap_user: params.imapUser,
      imap_pass: params.imapPass,
      imap_forward_token: params.imapForwardToken,
    })
    .returning();
  if (!row) throw new Error("Failed to create IMAP account");
  return row as Account;
};
