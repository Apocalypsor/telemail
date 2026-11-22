import type {
  GraphMessage,
  GraphMessageList,
} from "@worker/providers/outlook/types";
import { graphGet } from "@worker/providers/outlook/utils/api";
import {
  buildOutlookSearchQuery,
  getOutlookSearchFolder,
} from "@worker/providers/outlook/utils/search";
import type {
  EmailCount,
  EmailListItem,
  EmailListPage,
} from "@worker/providers/types";
import { sortEmailListItemsByDateDesc } from "@worker/providers/utils";
import {
  type ParsedGmailSearchQuery,
  parseGmailSearchQuery,
} from "@worker/utils/mail/search";

const OUTLOOK_LIST_SELECT =
  "id,subject,from,toRecipients,receivedDateTime,hasAttachments,isRead,flag";
const OUTLOOK_COUNT_PAGE_SIZE = 100;

type GraphEmailAddress = { name?: string; address?: string };

const formatGraphAddress = (
  emailAddress?: GraphEmailAddress,
): string | undefined => {
  if (!emailAddress) return undefined;
  return emailAddress.address
    ? emailAddress.name
      ? `${emailAddress.name} <${emailAddress.address}>`
      : emailAddress.address
    : emailAddress.name;
};

const toEmailListItem = (message: GraphMessage): EmailListItem => ({
  id: message.id,
  subject: message.subject,
  from: formatGraphAddress(message.from?.emailAddress),
  to: message.toRecipients
    ?.map((recipient) => formatGraphAddress(recipient.emailAddress))
    .filter((value): value is string => !!value)
    .join(", "),
  date: message.receivedDateTime,
});

export const buildOutlookUnreadListPath = (maxResults: number): string =>
  `/me/mailFolders('Inbox')/messages?$filter=isRead eq false&$select=${OUTLOOK_LIST_SELECT}&$top=${maxResults}`;

export const buildOutlookUnreadCountPath = (maxResults: number): string =>
  `/me/mailFolders('Inbox')/messages?$filter=isRead eq false&$select=id&$top=${maxResults}`;

export const buildOutlookStarredListPath = (maxResults: number): string =>
  `/me/messages?$filter=flag/flagStatus eq 'flagged'&$select=${OUTLOOK_LIST_SELECT}&$top=${maxResults}`;

export const buildOutlookJunkListPath = (maxResults: number): string =>
  `/me/mailFolders('JunkEmail')/messages?$select=${OUTLOOK_LIST_SELECT}&$top=${maxResults}`;

export const buildOutlookJunkCountPath = (maxResults: number): string =>
  `/me/mailFolders('JunkEmail')/messages?$select=id&$top=${maxResults}`;

export const buildOutlookArchivedListPath = (maxResults: number): string =>
  `/me/mailFolders('archive')/messages?$select=${OUTLOOK_LIST_SELECT}&$top=${maxResults}`;

export const buildOutlookSearchListPath = (
  query: ParsedGmailSearchQuery | string,
  maxResults: number,
): string => {
  const parsed =
    typeof query === "string" ? parseGmailSearchQuery(query) : query;
  const search = buildOutlookSearchQuery(parsed);
  const folder = getOutlookSearchFolder(parsed);
  const base = folder
    ? `/me/mailFolders('${folder}')/messages`
    : "/me/messages";
  const searchParam = search
    ? `?$search=${encodeURIComponent(`"${search}"`)}&`
    : "?";
  return `${base}${searchParam}$select=${OUTLOOK_LIST_SELECT}&$top=${maxResults}`;
};

export const listOutlookMessagesPage = async (
  token: string,
  path: string,
  cursor: string | undefined,
  filter?: (message: GraphMessage) => boolean,
): Promise<EmailListPage> => {
  let requestPath = cursor ?? path;
  let messages: GraphMessage[] = [];
  let nextCursor: string | null = null;
  do {
    const data = await graphGet<GraphMessageList>(token, requestPath);
    messages = messages.concat(
      (data.value ?? []).filter((message) => !filter || filter(message)),
    );
    nextCursor = data["@odata.nextLink"] ?? null;
    if (!filter || messages.length > 0 || !nextCursor) break;
    requestPath = nextCursor;
  } while (nextCursor);

  return {
    items: sortEmailListItemsByDateDesc(messages.map(toEmailListItem)),
    nextCursor,
  };
};

export const countOutlookMessagesByPath = async (
  token: string,
  pathBuilder: (maxResults: number) => string,
  maxCount: number,
): Promise<EmailCount> => {
  const limit = Math.max(1, Math.trunc(maxCount));
  let count = 0;
  let cursor: string | undefined;

  while (count < limit) {
    const path =
      cursor ?? pathBuilder(Math.min(OUTLOOK_COUNT_PAGE_SIZE, limit - count));
    const data = await graphGet<GraphMessageList>(token, path);
    const pageCount = data.value?.length ?? 0;
    count += pageCount;

    if (!data["@odata.nextLink"]) return { count, truncated: false };
    if (pageCount === 0) return { count, truncated: true };
    cursor = data["@odata.nextLink"];
  }

  return { count, truncated: !!cursor };
};
