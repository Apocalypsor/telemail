import { getAuthorizedAccount } from "@worker/db/accounts";
import { getUserByTelegramId } from "@worker/db/users";
import { accountCanArchive, PROVIDERS } from "@worker/providers";
import { isImapBridgeConfigured } from "@worker/providers/imap/utils/client";
import type { Account, AccountType, Env, TelegramUser } from "@worker/types";
import { getWorkerBaseUrl } from "@worker/utils/url";
import { formatUserName } from "@worker/utils/user-format";
import type {
  AccountProviderOption,
  AccountResponse,
  AccountUserOption,
} from "./model";

export const parseAccountId = (raw: string | undefined): number | null => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
};

export const requireAccountId = (
  id: string | undefined,
): { ok: true; accountId: number } | { ok: false; error: string } => {
  const accountId = parseAccountId(id);
  if (!accountId) return { ok: false, error: "Invalid id" };
  return { ok: true, accountId };
};

export const isValidChatId = (value: string): boolean => {
  return /^-?\d+$/.test(value.trim());
};

export const normalizeChatId = (chatId: string): string | null => {
  const trimmed = chatId.trim();
  return isValidChatId(trimmed) ? trimmed : null;
};

export const oauthCallbackUrl = (env: Env, type: AccountType): string => {
  const origin = getWorkerBaseUrl(env);
  return `${origin}/oauth/${type}/callback`;
};

export const getAuthorizedAccountOrResult = async (
  env: Env,
  accountId: number,
  userId: string,
  isAdmin: boolean,
): Promise<Account | { ok: false; status: number; error: string }> => {
  const account = await getAuthorizedAccount(
    env.DB,
    accountId,
    userId,
    isAdmin,
  );
  if (!account)
    return { ok: false, status: 404, error: "账号不存在或无权访问" };
  return account;
};

export const buildOwnerName = async (
  db: D1Database,
  account: Account,
): Promise<string | null> => {
  if (!account.telegram_user_id) return null;
  const owner = await getUserByTelegramId(db, account.telegram_user_id);
  if (!owner) return account.telegram_user_id;
  return owner.username ? `@${owner.username}` : formatUserName(owner);
};

export const toAccountResponse = async (
  env: Env,
  account: Account,
): Promise<AccountResponse> => {
  const klass = PROVIDERS[account.type];
  const oauth = klass.oauth;
  return {
    id: account.id,
    type: account.type,
    typeName: klass.displayName,
    email: account.email,
    chatId: account.chat_id,
    disabled: !!account.disabled,
    authorized: oauth ? !!account.refresh_token : true,
    oauth: !!oauth,
    oauthProviderName: oauth?.name ?? null,
    needsArchiveSetup: klass.needsArchiveSetup,
    canArchive: accountCanArchive(account),
    archiveFolder: account.archive_folder,
    archiveFolderName: account.archive_folder_name,
    ownerTelegramId: account.telegram_user_id,
    ownerName: await buildOwnerName(env.DB, account),
    imapHost: account.imap_host,
    imapPort: account.imap_port,
    imapSecure: !!account.imap_secure,
    imapUser: account.imap_user,
  };
};

export const toProviderOptions = (env: Env): AccountProviderOption[] => {
  return (
    Object.entries(PROVIDERS) as [
      AccountType,
      (typeof PROVIDERS)[AccountType],
    ][]
  ).map(([type, klass]) => ({
    type,
    displayName: klass.displayName,
    oauth: !!klass.oauth,
    oauthProviderName: klass.oauth?.name ?? null,
    configured: klass.oauth
      ? klass.oauth.isConfigured(env)
      : isImapBridgeConfigured(env),
    needsArchiveSetup: klass.needsArchiveSetup,
  }));
};

export const toUserOption = (user: TelegramUser): AccountUserOption => ({
  telegramId: user.telegram_id,
  label: user.username ? `@${user.username}` : formatUserName(user),
  username: user.username,
});
