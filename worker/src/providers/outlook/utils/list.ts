import type {
  GraphMessage,
  GraphMessageList,
} from "@worker/providers/outlook/types";
import { graphGet } from "@worker/providers/outlook/utils/api";
import type { EmailListItem, EmailListPage } from "@worker/providers/types";

const OUTLOOK_LIST_SELECT = "id,subject,from,toRecipients";

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

export const buildOutlookStarredListPath = (maxResults: number): string =>
  `/me/messages?$filter=flag/flagStatus eq 'flagged'&$select=${OUTLOOK_LIST_SELECT}&$top=${maxResults}`;

export const buildOutlookJunkListPath = (maxResults: number): string =>
  `/me/mailFolders('JunkEmail')/messages?$select=${OUTLOOK_LIST_SELECT}&$top=${maxResults}`;

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
