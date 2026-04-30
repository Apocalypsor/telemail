import type { ActiveConnection } from "@middleware/imap/types";
import type { ImapFlow } from "imapflow";
import type { MessageHit, MessageSummary } from "../types";

/**
 * `SEARCH HEADER MESSAGE-ID` 在不同 IMAP 实现里对 `<...>` 的处理参差：
 *  - Dovecot / Cyrus 大多走 RFC 3501 substring，带括号 / 不带都能命中
 *  - iCloud / 部分自托管 Dovecot 索引时把外层 `<>` 剥掉，搜带括号反而 0 命中
 *  - 反过来某些服务器只匹配带括号的原样
 *
 * 没法靠单一形态覆盖全部，唯一稳妥做法就是两种形态都试一次。`stripped` 工具函数
 * 给调用方按需用。
 */
export function normalizeMessageIdForSearch(rfcMessageId: string): string {
  return rfcMessageId.replace(/^<+|>+$/g, "").trim();
}

/**
 * 调用方已经持有当前 mailbox lock（`getMailboxLock` 之后）—— 在已 SELECT 的
 * mailbox 里按 RFC 822 Message-Id 找 UID。先按原样（含括号）搜一次，再用剥括号
 * 形态兜底，覆盖两类服务器存储行为。多条匹配取最新（UID 最大）。
 */
export async function findUidInMailbox(
  client: ImapFlow,
  rfcMessageId: string,
): Promise<number | null> {
  const stripped = normalizeMessageIdForSearch(rfcMessageId);
  const forms =
    stripped === rfcMessageId ? [rfcMessageId] : [rfcMessageId, stripped];
  for (const value of forms) {
    const hits = await client.search(
      { header: { "message-id": value } },
      { uid: true },
    );
    if (Array.isArray(hits) && hits.length > 0) {
      return (hits as number[]).sort((a, b) => b - a)[0];
    }
  }
  return null;
}

/**
 * 在 `folder` 里按 RFC 822 Message-Id 搜 UID。多条匹配时取最新（UID 最大）。
 * 没找到返回 null；folder 不存在 / 无权限 → 抛错由调用方处理。
 */
export async function findUidByMessageId(
  conn: ActiveConnection,
  folder: string,
  rfcMessageId: string,
): Promise<number | null> {
  const lock = await conn.client.getMailboxLock(folder);
  try {
    return await findUidInMailbox(conn.client, rfcMessageId);
  } finally {
    lock.release();
  }
}

/** 在候选文件夹里依次按 Message-Id 搜索，返回命中的 `{folder, uid}` 或 null */
export async function locateMessage(
  conn: ActiveConnection,
  rfcMessageId: string,
  folders: string[],
): Promise<MessageHit | null> {
  for (const folder of folders) {
    const uid = await findUidByMessageId(conn, folder, rfcMessageId);
    if (uid !== null) return { folder, uid };
  }
  return null;
}

export async function searchAndFetch(
  conn: ActiveConnection,
  folder: string,
  searchQuery: Record<string, unknown>,
  maxResults: number,
): Promise<MessageSummary[]> {
  const lock = await conn.client.getMailboxLock(folder);
  try {
    const result = await conn.client.search(searchQuery, { uid: true });
    if (!result || !Array.isArray(result)) return [];
    const uids = (result as number[])
      .sort((a: number, b: number) => b - a)
      .slice(0, maxResults);
    if (uids.length === 0) return [];

    const range = uids.join(",");
    const fetched = await conn.client.fetchAll(
      range,
      { envelope: true },
      { uid: true },
    );
    // 无 Message-Id 的邮件（罕见）直接跳过 —— 没法跨 folder 追踪，后续 action 也做不了
    return fetched
      .filter((msg) => !!msg.envelope?.messageId)
      .map((msg) => ({
        id: msg.envelope?.messageId as string,
        subject: msg.envelope?.subject ?? undefined,
      }));
  } finally {
    lock.release();
  }
}
