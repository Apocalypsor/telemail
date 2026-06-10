import type { Account } from "@worker/types";

export interface ImapBridgePushBody {
  accountId: number;
  rfcMessageId: string;
}

export const toImapBridgeAccount = (acc: Account) => ({
  id: acc.id,
  email: acc.email,
  chat_id: acc.chat_id,
  imap_host: acc.imap_host,
  imap_port: acc.imap_port,
  imap_secure: !!acc.imap_secure,
  imap_user: acc.imap_user,
  imap_pass: acc.imap_pass,
});

export const isImapBridgePushBody = (
  body: unknown,
): body is ImapBridgePushBody => {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Partial<ImapBridgePushBody>;
  return (
    typeof candidate.accountId === "number" &&
    Number.isInteger(candidate.accountId) &&
    candidate.accountId > 0 &&
    typeof candidate.rfcMessageId === "string" &&
    candidate.rfcMessageId.length > 0
  );
};
