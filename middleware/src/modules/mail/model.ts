import { t } from "elysia";

/**
 * IMAP bridge 对外统一用 RFC 822 Message-Id 标识邮件（不是 per-folder 的 UID）。
 * Middleware 内部按需 SEARCH HEADER Message-Id 拿当前 folder 的 UID 再操作。
 */
export const AccountMessageBody = t.Object({
  accountId: t.Number(),
  rfcMessageId: t.String(),
});

export const AccountBody = t.Object({
  accountId: t.Number(),
});

export const FetchBody = t.Object({
  accountId: t.Number(),
  rfcMessageId: t.String(),
  /**
   * 定位 Message-Id 时先查哪个 folder —— 不影响正确性（SEARCH HEADER 全局唯一），
   * 只影响速度和歧义（Gmail All Mail 和 INBOX 会同时持有同一封，hint 决定选哪封）。
   */
  folder: t.Optional(
    t.Union([t.Literal("inbox"), t.Literal("junk"), t.Literal("archive")]),
  ),
  /** folder==="archive" 时覆盖归档文件夹路径；未传则 bridge 自动探测 */
  archiveFolder: t.Optional(t.String()),
});

export const FlagBody = t.Object({
  accountId: t.Number(),
  rfcMessageId: t.String(),
  flag: t.String(),
  add: t.Boolean(),
});

export const ListBody = t.Object({
  accountId: t.Number(),
  maxResults: t.Optional(t.Number()),
});

export const ArchiveBody = t.Object({
  accountId: t.Number(),
  rfcMessageId: t.String(),
  /** 目标归档文件夹名（可选，不传则自动探测 \Archive special-use，再 fallback 到 "Archive"） */
  folder: t.Optional(t.String()),
});

export const UnarchiveBody = t.Object({
  accountId: t.Number(),
  rfcMessageId: t.String(),
  /** 源归档文件夹名（可选，同 ArchiveBody 的探测逻辑） */
  archiveFolder: t.Optional(t.String()),
});

export const ListFolderBody = t.Object({
  accountId: t.Number(),
  /** 可选，不传则同 archive 的探测逻辑 */
  folder: t.Optional(t.String()),
  maxResults: t.Optional(t.Number()),
});

export const SearchBody = t.Object({
  accountId: t.Number(),
  /** 用户输入的关键词；空白由 plugin 内部过滤 */
  query: t.String(),
  maxResults: t.Optional(t.Number()),
});

export const LocateBody = t.Object({
  accountId: t.Number(),
  rfcMessageId: t.String(),
  /** 用户自定义归档文件夹名（可选，同 ArchiveBody 的探测逻辑） */
  archiveFolder: t.Optional(t.String()),
});
