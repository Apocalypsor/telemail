import { getAllAccounts } from "@worker/db/accounts";
import { getMappingsByEmailIds } from "@worker/db/message-map";
import { getEmailProvider } from "@worker/providers";
import {
  type Account,
  AccountType,
  type Env,
  QueueMessageType,
} from "@worker/types";
import { reportErrorToObservability } from "@worker/utils/observability";

export interface MailSyncResult {
  enqueued: number;
  error?: string;
}

export interface AccountMailSyncResult extends MailSyncResult {
  account: Account;
}

const DEFAULT_MAX_SYNC_PER_ACCOUNT = 50;

export const syncAccountUnreadMail = async (
  env: Env,
  account: Account,
  maxMessages = DEFAULT_MAX_SYNC_PER_ACCOUNT,
): Promise<MailSyncResult> => {
  try {
    const provider = getEmailProvider(account, env);
    const unread = await provider.listUnread(maxMessages);
    if (unread.length === 0) return { enqueued: 0 };

    const mappings = await getMappingsByEmailIds(
      env.DB,
      account.id,
      unread.map((m) => m.id),
    );
    const delivered = new Set(mappings.map((m) => m.email_message_id));
    const newMessages = unread.filter((m) => !delivered.has(m.id));
    if (newMessages.length === 0) return { enqueued: 0 };

    await env.EMAIL_QUEUE.sendBatch(
      newMessages.map((m) => ({
        body: {
          type: QueueMessageType.Email,
          accountId: account.id,
          emailMessageId: m.id,
        },
      })),
    );
    return { enqueued: newMessages.length };
  } catch (err) {
    await reportErrorToObservability(env, "mail_sync.account_failed", err, {
      accountId: account.id,
    });
    return {
      enqueued: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

export const syncAccountsUnreadMail = async (
  env: Env,
  accounts: Account[],
): Promise<AccountMailSyncResult[]> =>
  Promise.all(
    accounts.map(async (account) => ({
      account,
      ...(await syncAccountUnreadMail(env, account)),
    })),
  );

export const syncAllEnabledAccountsUnreadMail = async (
  env: Env,
): Promise<AccountMailSyncResult[]> => {
  const accounts = (await getAllAccounts(env.DB)).filter(canPollAccount);
  const results: AccountMailSyncResult[] = [];

  // ponytail: sequential scan keeps cron from bursting IMAP/API connections; add bounded concurrency if account count makes this too slow.
  for (const account of accounts) {
    results.push({
      account,
      ...(await syncAccountUnreadMail(env, account)),
    });
  }

  return results;
};

const canPollAccount = (account: Account): boolean => {
  if (account.disabled) return false;
  if (account.type === AccountType.Imap) return true;
  return !!account.refresh_token;
};
