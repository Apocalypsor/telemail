import type { ActiveConnection } from "@middleware/connections/types";
import type { ImapFlow } from "imapflow";
import type { MessageHit, MessageSummary } from "../types";

type EnvelopeAddress = {
  name?: string;
  address?: string;
};

export const formatEnvelopeAddresses = (
  addresses: EnvelopeAddress[] | undefined,
): string | undefined => {
  const formatted = addresses
    ?.map((addr) =>
      addr.address
        ? addr.name
          ? `${addr.name} <${addr.address}>`
          : addr.address
        : addr.name,
    )
    .filter((value): value is string => !!value);
  return formatted && formatted.length > 0 ? formatted.join(", ") : undefined;
};

/**
 * 调用方已经持有当前 mailbox lock（`getMailboxLock` 之后）—— 在已 SELECT 的
 * mailbox 里按 RFC 822 Message-Id 找 UID。`rfcMessageId` 透传给 SEARCH HEADER，
 * 不做任何形态规整：服务器命不中是服务器自己的问题，不在客户端层做兜底。多条
 * 匹配取最新（UID 最大）。
 */
export const findUidInMailbox = async (
  client: ImapFlow,
  rfcMessageId: string,
): Promise<number | null> => {
  const hits = await client.search(
    { header: { "message-id": rfcMessageId } },
    { uid: true },
  );
  if (!Array.isArray(hits) || hits.length === 0) return null;
  return (hits as number[]).sort((a, b) => b - a)[0];
};

/**
 * 在 `folder` 里按 RFC 822 Message-Id 搜 UID。多条匹配时取最新（UID 最大）。
 * 没找到返回 null；folder 不存在 / 无权限 → 抛错由调用方处理。
 */
export const findUidByMessageId = async (
  conn: ActiveConnection,
  folder: string,
  rfcMessageId: string,
): Promise<number | null> => {
  const lock = await conn.client.getMailboxLock(folder);
  try {
    return await findUidInMailbox(conn.client, rfcMessageId);
  } finally {
    lock.release();
  }
};

/** 在候选文件夹里依次按 Message-Id 搜索，返回命中的 `{folder, uid}` 或 null */
export const locateMessage = async (
  conn: ActiveConnection,
  rfcMessageId: string,
  folders: string[],
): Promise<MessageHit | null> => {
  for (const folder of folders) {
    const uid = await findUidByMessageId(conn, folder, rfcMessageId);
    if (uid !== null) return { folder, uid };
  }
  return null;
};

export const searchAndFetch = async (
  conn: ActiveConnection,
  folder: string,
  searchQuery: Record<string, unknown>,
  maxResults: number,
  offset: number = 0,
): Promise<MessageSummary[]> => {
  const lock = await conn.client.getMailboxLock(folder);
  try {
    const result = await conn.client.search(searchQuery, { uid: true });
    if (!result || !Array.isArray(result)) return [];
    const uids = (result as number[])
      .sort((a: number, b: number) => b - a)
      .slice(offset, offset + maxResults);
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
        from: formatEnvelopeAddresses(msg.envelope?.from),
        to: formatEnvelopeAddresses(msg.envelope?.to),
      }));
  } finally {
    lock.release();
  }
};
