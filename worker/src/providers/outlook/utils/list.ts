import type {
  GraphMessage,
  GraphMessageList,
} from "@worker/providers/outlook/types";
import { graphGet } from "@worker/providers/outlook/utils/api";
import type {
  EmailCount,
  EmailListItem,
  EmailListPage,
} from "@worker/providers/types";

const OUTLOOK_LIST_SELECT = "id,subject,from,toRecipients";
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
  query: string,
  maxResults: number,
): string => {
  const escaped = query.replace(/"/g, '\\"');
  return `/me/messages?$search=${encodeURIComponent(`"${escaped}"`)}&$select=${OUTLOOK_LIST_SELECT}&$top=${maxResults}`;
};

export const listOutlookMessagesPage = async (
  token: string,
  path: string,
  cursor: string | undefined,
): Promise<EmailListPage> => {
  const data = await graphGet<GraphMessageList>(token, cursor ?? path);
  return {
    items: (data.value ?? []).map(toEmailListItem),
    nextCursor: data["@odata.nextLink"] ?? null,
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
