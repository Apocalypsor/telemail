import type { EmailListItem, EmailListPage } from "@worker/providers/types";

export const listImapPage = async (
  maxResults: number,
  cursor: string | undefined,
  fetcher: (maxResults: number, offset: number) => Promise<EmailListItem[]>,
): Promise<EmailListPage> => {
  const offset = parseOffsetCursor(cursor);
  const items = await fetcher(maxResults + 1, offset);
  return {
    items: items.slice(0, maxResults),
    nextCursor: items.length > maxResults ? String(offset + maxResults) : null,
  };
};

const parseOffsetCursor = (cursor: string | undefined): number => {
  if (!cursor) return 0;
  const offset = Number(cursor);
  return Number.isInteger(offset) && offset > 0 ? offset : 0;
};
