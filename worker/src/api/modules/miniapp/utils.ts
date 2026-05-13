/** Miniapp module 私有 helper：邮件列表 4 种类型（unread/starred/junk/archived）的
 *  配置表。service 用 `LIST_DEFS[type]` 取 fetcher / 副作用 / 展示 hint。 */
import type { MessageMapping } from "@worker/db/message-map";
import type { EmailProvider } from "@worker/providers/base";
import type { EmailListItem } from "@worker/providers/types";
import type { Account, Env } from "@worker/types";
import { deleteJunkMappings } from "@worker/utils/message-actions/cleanup";
import { syncStarButtonsForMappings } from "@worker/utils/message-actions/keyboard";
import type { MailListType } from "./model";

/** preview URL 要带 folder 提示给 IMAP 定位 UID —— bot mail-list 渲染时用。 */
export const getPreviewFolder = (
  type: MailListType,
): "inbox" | "junk" | "archive" | undefined => {
  return LIST_DEFS[type].previewFolder;
};

/** narrow URL param string → 4 种合法 list type。直接用 LIST_DEFS 的 key 集合，
 *  避免另写一份字面量数组维护双份真相。 */
export const isMailListType = (s: string): s is MailListType => {
  return Object.hasOwn(LIST_DEFS, s);
};
export const MAX_PER_ACCOUNT = 20;
export const MAX_PAGE_SIZE = 50;

export const normalizePageLimit = (limit: number | undefined): number => {
  if (!Number.isFinite(limit)) return MAX_PER_ACCOUNT;
  return Math.min(
    Math.max(Math.trunc(limit ?? MAX_PER_ACCOUNT), 1),
    MAX_PAGE_SIZE,
  );
};

export const parseAccountCursor = (
  raw: string | undefined,
): Map<number, string> | undefined => {
  if (!raw) return undefined;

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid cursor");
  }

  const cursorByAccount = new Map<number, string>();
  for (const [accountIdRaw, cursorRaw] of Object.entries(parsed)) {
    const accountId = Number(accountIdRaw);
    const cursor = typeof cursorRaw === "string" ? cursorRaw : "";
    if (!Number.isInteger(accountId) || accountId <= 0 || !cursor) {
      throw new Error("Invalid cursor");
    }
    cursorByAccount.set(accountId, cursor);
  }

  return cursorByAccount;
};

interface ListDef {
  fetcher: (p: EmailProvider, maxResults: number) => Promise<EmailListItem[]>;
  pageFetcher: (
    p: EmailProvider,
    maxResults: number,
    cursor?: string,
  ) => Promise<{ items: EmailListItem[]; nextCursor: string | null }>;
  errorEvent: string;
  /** junk/archive 列表：TG 消息可能已被删除，不返回 tgLink */
  hideTgLinks?: boolean;
  /** preview URL 需要带 folder 提示给 IMAP 定位 UID（per-folder） */
  previewFolder?: "inbox" | "junk" | "archive";
  /** 列出后的副作用 —— starred: 同步键盘；junk: 清 mapping；其余无 */
  afterMappings?: (
    env: Env,
    mappings: MessageMapping[],
    account: Account,
  ) => Promise<void>;
}

export const LIST_DEFS: Record<MailListType, ListDef> = {
  unread: {
    fetcher: (p, maxResults) => p.listUnread(maxResults),
    pageFetcher: (p, maxResults, cursor) =>
      p.listUnreadPage(maxResults, cursor),
    errorEvent: "bot.unread_query_failed",
  },
  starred: {
    fetcher: (p, maxResults) => p.listStarred(maxResults),
    pageFetcher: (p, maxResults, cursor) =>
      p.listStarredPage(maxResults, cursor),
    errorEvent: "bot.starred_query_failed",
    afterMappings: (env, mappings, account) =>
      syncStarButtonsForMappings(env, mappings, account),
  },
  junk: {
    fetcher: (p, maxResults) => p.listJunk(maxResults),
    pageFetcher: (p, maxResults, cursor) => p.listJunkPage(maxResults, cursor),
    errorEvent: "bot.junk_query_failed",
    hideTgLinks: true,
    previewFolder: "junk",
    afterMappings: (env, mappings) => deleteJunkMappings(env, mappings),
  },
  archived: {
    fetcher: (p, maxResults) => p.listArchived(maxResults),
    pageFetcher: (p, maxResults, cursor) =>
      p.listArchivedPage(maxResults, cursor),
    errorEvent: "bot.archived_query_failed",
    hideTgLinks: true,
    previewFolder: "archive",
  },
};
