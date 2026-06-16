import type { WorkerImapClient } from "@worker/clients/imap";
import {
  getImapFolderPath,
  type ImapFolderKind,
  putImapFolderPath,
} from "@worker/db/kv";
import type { Env } from "@worker/types";

export type FolderHint = "inbox" | "junk" | "archive";

export const resolveFolderForHint = async (
  env: Env,
  client: WorkerImapClient,
  accountId: number,
  folderHint: FolderHint | undefined,
  archiveFolder: string | undefined,
): Promise<string | null> => {
  if (folderHint === "junk") return findJunkFolder(env, client, accountId);
  if (folderHint === "archive") {
    return resolveArchiveFolder(env, client, accountId, archiveFolder);
  }
  return "INBOX";
};

export const resolveArchiveFolder = async (
  env: Env,
  client: WorkerImapClient,
  accountId: number,
  explicit: string | undefined,
): Promise<string> => {
  if (explicit) return explicit;
  return (await findArchiveFolder(env, client, accountId)) ?? "Archive";
};

export const mailboxExists = async (
  client: WorkerImapClient,
  folder: string,
): Promise<boolean> => {
  const mailboxes = await client.listMailboxes();
  const normalized = folder.toLowerCase();
  return mailboxes.some((mailbox) => {
    const path = mailbox.path.toLowerCase();
    return path === normalized || mailboxName(path) === normalized;
  });
};

export const findJunkFolder = (
  env: Env,
  client: WorkerImapClient,
  accountId: number,
) =>
  findCachedSpecialFolder(env, client, accountId, "junk", "\\junk", [
    "junk",
    "junk email",
    "spam",
  ]);

export const findTrashFolder = (
  env: Env,
  client: WorkerImapClient,
  accountId: number,
) =>
  findCachedSpecialFolder(env, client, accountId, "trash", "\\trash", [
    "trash",
    "deleted items",
    "deleted messages",
    "bin",
  ]);

export const findArchiveFolder = (
  env: Env,
  client: WorkerImapClient,
  accountId: number,
) =>
  findCachedSpecialFolder(env, client, accountId, "archive", "\\archive", [
    "archive",
    "archives",
    "all mail",
    "[gmail]/all mail",
  ]);

const findCachedSpecialFolder = async (
  env: Env,
  client: WorkerImapClient,
  accountId: number,
  kind: ImapFolderKind,
  specialUse: string,
  nameMatches: string[],
): Promise<string | null> => {
  const cached = await getImapFolderPath(env.EMAIL_KV, accountId, kind);
  if (cached.hit) return cached.path;

  const mailboxes = await client.listMailboxes();
  const byFlag = mailboxes.find((mailbox) =>
    mailbox.flags.some((flag) => flag.toLowerCase() === specialUse),
  );
  const byName = mailboxes.find((mailbox) =>
    nameMatches.includes(mailboxName(mailbox.path.toLowerCase())),
  );
  const path = byFlag?.path ?? byName?.path ?? null;
  await putImapFolderPath(env.EMAIL_KV, accountId, kind, path);
  return path;
};

const mailboxName = (path: string): string => {
  const normalized = path.toLowerCase();
  const parts = normalized.split(/[/.]/);
  return parts[parts.length - 1] ?? normalized;
};
