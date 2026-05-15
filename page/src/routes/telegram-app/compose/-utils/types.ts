export type ComposeFolder = "inbox" | "junk" | "archive";

export interface ComposeSearch {
  accountId?: number;
  to?: string;
  subject?: string;
  replyEmailMessageId?: string;
  token?: string;
  folder?: ComposeFolder;
  back?: string;
}
