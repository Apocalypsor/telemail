import type { ActiveConnection } from "@middleware/connections/types";
import {
  type FolderKind,
  getCachedFolderPath,
  setCachedFolderPath,
} from "@middleware/utils/redis";
import type { FolderHint } from "../types";

export const findSpecialFolder = async (
  conn: ActiveConnection,
  specialUse: string,
  nameMatches: string[],
): Promise<string | null> => {
  const mailboxes = await conn.client.list();
  const box =
    mailboxes.find((m) => m.specialUse === specialUse) ??
    mailboxes.find((m) => nameMatches.includes(m.name.toLowerCase()));
  return box?.path ?? null;
};

/**
 * `findSpecialFolder` 的 Redis 缓存包装。每个 (account, kind) 单独缓存，命中后省
 * 掉 IMAP `LIST` 调用。`null`（"找不到这种 folder"）也会被缓存，避免反复重试探测。
 * 缓存的失效在 `redis.ts` 用 TTL 兜底，账号 stop / config 变更时主动 clear。
 */
const findCachedSpecialFolder = async (
  conn: ActiveConnection,
  kind: FolderKind,
  specialUse: string,
  nameMatches: string[],
): Promise<string | null> => {
  const cached = await getCachedFolderPath(conn.account.id, kind);
  if (cached !== undefined) return cached;
  const path = await findSpecialFolder(conn, specialUse, nameMatches);
  await setCachedFolderPath(conn.account.id, kind, path);
  return path;
};

export const findJunkFolder = (conn: ActiveConnection) =>
  findCachedSpecialFolder(conn, "junk", "\\Junk", [
    "junk",
    "junk email",
    "spam",
  ]);

export const findTrashFolder = (conn: ActiveConnection) =>
  findCachedSpecialFolder(conn, "trash", "\\Trash", [
    "trash",
    "deleted items",
    "deleted messages",
    "bin",
  ]);

export const findArchiveFolder = (conn: ActiveConnection) =>
  findCachedSpecialFolder(conn, "archive", "\\Archive", [
    "archive",
    "archives",
    "all mail",
    "[gmail]/all mail",
  ]);

/**
 * 解析归档目标文件夹：
 * 1. 调用方显式指定 → 用指定的
 * 2. 否则查 `\Archive` special-use / 常见名字
 * 3. 都没有 → fallback 到字面量 "Archive"
 */
export async function resolveArchiveFolder(
  conn: ActiveConnection,
  explicit: string | undefined,
): Promise<string> {
  if (explicit) return explicit;
  return (await findArchiveFolder(conn)) ?? "Archive";
}

/**
 * 把 worker 端的 `folderHint` 解析成具体 IMAP folder path —— setFlag / fetchEmail /
 * isStarred 都用这个映射。`junk` hint 但服务器没 junk folder → 返回 null，调用方
 * 自己决定怎么处理（warn / throw / silent false）；其它分支总能给出 path
 * （archive 不存在会自动 fallback 到 "Archive"）。
 */
export async function resolveFolderForHint(
  conn: ActiveConnection,
  folderHint: FolderHint | undefined,
  archiveFolder: string | undefined,
): Promise<string | null> {
  if (folderHint === "junk") return findJunkFolder(conn);
  if (folderHint === "archive")
    return resolveArchiveFolder(conn, archiveFolder);
  return "INBOX";
}
