import { bridgeCall } from "@worker/providers/imap/utils/client";
import type { EmailListItem, EmailListPage } from "@worker/providers/types";

type BridgeListFetcher = (
  limit: number,
  offset: number,
) => Promise<{ data: { messages?: EmailListItem[] } | null }>;

const parseImapOffsetCursor = (cursor: string | undefined): number => {
  if (!cursor) return 0;
  const offset = Number(cursor);
  return Number.isInteger(offset) && offset > 0 ? offset : 0;
};

export const listImapBridgePage = async (
  maxResults: number,
  cursor: string | undefined,
  fetcher: BridgeListFetcher,
): Promise<EmailListPage> => {
  const offset = parseImapOffsetCursor(cursor);
  const data = await bridgeCall(fetcher(maxResults + 1, offset));
  const messages = data.messages ?? [];
  return {
    items: messages.slice(0, maxResults),
    nextCursor:
      messages.length > maxResults ? String(offset + maxResults) : null,
  };
};
