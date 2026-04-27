import { t } from "elysia";

/**
 * IMAP bridge 对外统一用 RFC 822 Message-Id 标识邮件（不是 per-folder 的 UID）。
 */
export const AccountMessageBody = t.Object({
  accountId: t.Number(),
  rfcMessageId: t.String(),
});

export const AccountBody = t.Object({
  accountId: t.Number(),
});

export const ListBody = t.Object({
  accountId: t.Number(),
  maxResults: t.Optional(t.Number()),
});
