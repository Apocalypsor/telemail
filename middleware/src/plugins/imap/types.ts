/** `fetchEmail` 调用方提示该邮件大概在哪个 folder —— 仅影响候选搜索顺序。 */
export type FolderHint = "inbox" | "junk" | "archive";

/** `locate` 返回的邮件位置：inbox / junk / archive / deleted。 */
export type MessageLocation = "inbox" | "junk" | "archive" | "deleted";

/** 列表 / 搜索的最小邮件信息 —— 只有 Message-Id 是必需的，其它字段视 envelope 而定。 */
export interface MessageSummary {
  id: string;
  subject?: string;
}

/** `searchMessages` 返回的结果：在 `MessageSummary` 基础上附带 from / date 用于排序展示。 */
export interface SearchResultMessage extends MessageSummary {
  from?: string;
  date?: string;
}

/** `locateMessage` 命中：UID 是 per-folder 的，所以必须配 folder 一起返回。 */
export interface MessageHit {
  folder: string;
  uid: number;
}

/** `locate` 完整返回值：location 必填；inbox 命中时附带 starred。 */
export interface LocateResult {
  location: MessageLocation;
  starred?: boolean;
}
