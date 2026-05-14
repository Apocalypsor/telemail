import type {
  GmailMessage,
  GmailMessageList,
} from "@worker/providers/gmail/types";
import { gmailGet } from "@worker/providers/gmail/utils/api";
import { gmailBatchGetMetadata } from "@worker/providers/gmail/utils/batch";
import type {
  EmailCount,
  EmailListItem,
  EmailListPage,
} from "@worker/providers/types";

const GMAIL_COUNT_PAGE_SIZE = 100;

const getHeader = (message: GmailMessage, name: string): string | undefined => {
  const lowerName = name.toLowerCase();
  return message.payload?.headers?.find(
    (h) => h.name.toLowerCase() === lowerName,
  )?.value;
};

/**
 * 把 `messages.list` 返回的 `[{id, threadId}]` 用 batch metadata 补成列表项。
 * 列表页只需要轻量 headers，避免为每封邮件逐个 `messages.get`。
 */
export const hydrateGmailListItems = async (
  token: string,
  messages: { id: string }[] | undefined,
): Promise<EmailListItem[]> => {
  if (!messages || messages.length === 0) return [];
  const ids = messages.map((m) => m.id);
  const metaMap = await gmailBatchGetMetadata(token, ids, [
    "Subject",
    "From",
    "To",
  ]);
  return ids.map((id) => {
    const msg = metaMap.get(id);
    if (!msg) return { id };
    return {
      id,
      subject: getHeader(msg, "subject"),
      from: getHeader(msg, "from"),
      to: getHeader(msg, "to"),
    };
  });
};

export const listGmailMessagesByQuery = async (
  token: string,
  query: string,
  maxResults: number,
): Promise<EmailListItem[]> => {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });
  const data = await gmailGet<GmailMessageList>(
    token,
    `/users/me/messages?${params.toString()}`,
  );
  return hydrateGmailListItems(token, data.messages);
};

export const listGmailMessagesByQueryPage = async (
  token: string,
  query: string,
  maxResults: number,
  pageToken: string | undefined,
): Promise<EmailListPage> => {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });
  if (pageToken) params.set("pageToken", pageToken);
  const data = await gmailGet<GmailMessageList>(
    token,
    `/users/me/messages?${params.toString()}`,
  );
  return {
    items: await hydrateGmailListItems(token, data.messages),
    nextCursor: data.nextPageToken ?? null,
  };
};

export const countGmailMessagesByQuery = async (
  token: string,
  query: string,
  maxCount: number,
): Promise<EmailCount> => {
  const limit = Math.max(1, Math.trunc(maxCount));
  let count = 0;
  let pageToken: string | undefined;

  while (count < limit) {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(GMAIL_COUNT_PAGE_SIZE, limit - count)),
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await gmailGet<GmailMessageList>(
      token,
      `/users/me/messages?${params.toString()}`,
    );
    const pageCount = data.messages?.length ?? 0;
    count += pageCount;

    if (!data.nextPageToken) return { count, truncated: false };
    if (pageCount === 0) return { count, truncated: true };
    pageToken = data.nextPageToken;
  }

  return { count, truncated: !!pageToken };
};

export const listGmailMessagesByLabel = async (
  token: string,
  labelId: string,
  maxResults: number,
): Promise<EmailListItem[]> => {
  const params = new URLSearchParams({
    labelIds: labelId,
    maxResults: String(maxResults),
  });
  const data = await gmailGet<GmailMessageList>(
    token,
    `/users/me/messages?${params.toString()}`,
  );
  return hydrateGmailListItems(token, data.messages);
};

export const listGmailMessagesByLabelPage = async (
  token: string,
  labelId: string,
  maxResults: number,
  pageToken: string | undefined,
): Promise<EmailListPage> => {
  const params = new URLSearchParams({
    labelIds: labelId,
    maxResults: String(maxResults),
  });
  if (pageToken) params.set("pageToken", pageToken);
  const data = await gmailGet<GmailMessageList>(
    token,
    `/users/me/messages?${params.toString()}`,
  );
  return {
    items: await hydrateGmailListItems(token, data.messages),
    nextCursor: data.nextPageToken ?? null,
  };
};
