import type { GraphMessage } from "@worker/providers/outlook/types";
import type {
  GmailSearchClause,
  GmailSearchExpression,
  ParsedGmailSearchQuery,
} from "@worker/utils/mail/search";
import { parseGmailSearchDate } from "@worker/utils/mail/search";
import { escapeBackslashAndDoubleQuote } from "@worker/utils/string";

export type OutlookSearchFolder =
  | "Inbox"
  | "JunkEmail"
  | "DeletedItems"
  | "SentItems"
  | "Drafts"
  | "archive";

export const buildOutlookSearchQuery = (
  query: ParsedGmailSearchQuery,
): string => {
  return renderExpression(query.expression);
};

export const getOutlookSearchFolder = (
  query: ParsedGmailSearchQuery,
): OutlookSearchFolder | null => {
  const location = findLocationClause(query.expression);
  if (!location) return null;
  switch (location) {
    case "inbox":
      return "Inbox";
    case "spam":
      return "JunkEmail";
    case "trash":
      return "DeletedItems";
    case "sent":
      return "SentItems";
    case "draft":
      return "Drafts";
    case "archive":
      return "archive";
    default:
      return null;
  }
};

export const getOutlookSearchFilter = (
  query: ParsedGmailSearchQuery,
): ((message: GraphMessage) => boolean) | undefined => {
  const clauses = collectLocalFilterClauses(query.expression);
  if (clauses.length === 0) return undefined;
  return (message) =>
    clauses.every((clause) => matchesLocalFilterClause(clause, message));
};

const renderExpression = (expression: GmailSearchExpression): string => {
  if (expression.kind === "clause") return renderClause(expression);
  const items = expression.items
    .map(renderExpression)
    .filter((item) => item.length > 0);
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] as string;
  if (expression.kind === "and") return items.join(" AND ");
  return items.join(" OR ");
};

const renderClause = (clause: GmailSearchClause): string => {
  const value = escapeBackslashAndDoubleQuote(clause.value);
  let rendered: string;
  switch (clause.field) {
    case "text":
      rendered = value;
      break;
    case "from":
    case "to":
    case "cc":
    case "bcc":
      rendered = `${clause.field}:${value}`;
      break;
    case "subject":
      rendered = `subject:${value}`;
      break;
    case "deliveredto":
      rendered = `recipients:${value}`;
      break;
    case "after":
    case "newer":
    case "newer_than":
      rendered = renderDateClause("received>=", clause.value, clause.raw);
      break;
    case "before":
    case "older":
    case "older_than":
      rendered = renderDateClause("received<", clause.value, clause.raw);
      break;
    case "has":
      rendered =
        clause.value.toLowerCase() === "attachment"
          ? "hasAttachments:true"
          : value;
      break;
    case "is":
      rendered = renderIsClause(clause.value, value);
      break;
    case "filename":
      rendered = `attachment:${value}`;
      break;
    case "larger":
    case "size":
      rendered = `size>${value}`;
      break;
    case "smaller":
      rendered = `size<${value}`;
      break;
    case "in":
      rendered = "";
      break;
    default:
      rendered = `${clause.field}:${value}`;
      break;
  }
  return clause.negated && rendered ? `NOT ${rendered}` : rendered;
};

const renderDateClause = (
  operator: string,
  value: string,
  fallback: string,
): string => {
  const date = parseGmailSearchDate(value);
  if (!date) return escapeBackslashAndDoubleQuote(fallback);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${operator}${month}/${day}/${date.getUTCFullYear()}`;
};

const renderIsClause = (value: string, fallback: string): string => {
  switch (value.toLowerCase()) {
    case "unread":
      return "";
    case "read":
      return "";
    case "important":
      return "importance:high";
    case "starred":
    case "unstarred":
      return "";
    case "spam":
    case "trash":
    case "sent":
    case "draft":
      return "";
    default:
      return fallback;
  }
};

const collectLocalFilterClauses = (
  expression: GmailSearchExpression,
): GmailSearchClause[] => {
  if (expression.kind === "clause") {
    return isLocalFilterClause(expression) ? [expression] : [];
  }
  return expression.items.flatMap(collectLocalFilterClauses);
};

const isLocalFilterClause = (clause: GmailSearchClause): boolean => {
  return (
    clause.field === "is" &&
    ["starred", "unstarred", "unread", "read"].includes(
      clause.value.toLowerCase(),
    )
  );
};

const matchesLocalFilterClause = (
  clause: GmailSearchClause,
  message: GraphMessage,
): boolean => {
  const value = clause.value.toLowerCase();
  const expected = value === "starred";
  if (value === "unread" || value === "read") {
    const matches = message.isRead === (value === "read");
    return clause.negated ? !matches : matches;
  }
  const starred = message.flag?.flagStatus?.toLowerCase() === "flagged";
  const matches = starred === expected;
  return clause.negated ? !matches : matches;
};

const findLocationClause = (
  expression: GmailSearchExpression,
): string | null => {
  if (expression.kind === "clause") {
    if (expression.negated) return null;
    if (expression.field === "in") return normalizeLocation(expression.value);
    if (expression.field === "is") {
      const value = expression.value.toLowerCase();
      if (value === "spam" || value === "trash" || value === "sent") {
        return value;
      }
      if (value === "unread" || value === "read") return null;
    }
    return null;
  }
  for (const item of expression.items) {
    const location = findLocationClause(item);
    if (location) return location;
  }
  return null;
};

const normalizeLocation = (value: string): string | null => {
  switch (value.toLowerCase()) {
    case "inbox":
      return "inbox";
    case "spam":
    case "junk":
      return "spam";
    case "trash":
      return "trash";
    case "sent":
      return "sent";
    case "draft":
    case "drafts":
      return "draft";
    case "archive":
      return "archive";
    default:
      return null;
  }
};
