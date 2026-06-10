import type {
  MailListAccountResult,
  MailListItem,
} from "@worker/api/modules/miniapp/model";

export type MailListCursor = Record<string, string>;

export interface MailListPageLike {
  results: MailListAccountResult[];
}

export interface FlatMailListItem extends MailListItem {
  accountId: number;
  accountEmail: string | null;
}

export const MAIL_LIST_PAGE_SIZE = 20;

export const encodeMailListCursor = (
  cursor: MailListCursor | undefined,
): string | undefined => {
  if (!cursor || Object.keys(cursor).length === 0) return undefined;
  return JSON.stringify(cursor);
};

export const getNextMailListCursor = (
  page: MailListPageLike,
): MailListCursor | undefined => {
  const cursor: MailListCursor = {};
  for (const result of page.results) {
    if (result.nextCursor) cursor[String(result.accountId)] = result.nextCursor;
  }
  return Object.keys(cursor).length > 0 ? cursor : undefined;
};

export const flattenMailListPages = (
  pages: MailListPageLike[] | undefined,
): FlatMailListItem[] => {
  if (!pages) return [];
  return pages.flatMap((page) =>
    page.results.flatMap((result) =>
      result.items.map((item) => ({
        ...item,
        accountId: result.accountId,
        accountEmail: result.accountEmail,
      })),
    ),
  );
};

export const collectMailListErrors = (
  pages: MailListPageLike[] | undefined,
): MailListAccountResult[] => {
  if (!pages) return [];
  return pages.flatMap((page) =>
    page.results.filter((result) => Boolean(result.error)),
  );
};
