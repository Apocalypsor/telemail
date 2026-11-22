import { quoteImapString } from "@worker/clients/imap/utils";
import type {
  GmailSearchClause,
  GmailSearchExpression,
  ParsedGmailSearchQuery,
} from "@worker/utils/mail/search";
import { parseGmailSearchDate } from "@worker/utils/mail/search";

export type ImapSearchFolder = "inbox" | "junk" | "trash" | "archive";

export const buildImapSearchCriteria = (
  query: ParsedGmailSearchQuery,
): string => {
  return renderExpression(query.expression) || "ALL";
};

export const getImapSearchFolders = (
  query: ParsedGmailSearchQuery,
): Set<ImapSearchFolder> => {
  const positive = new Set<ImapSearchFolder>();
  const negative = new Set<ImapSearchFolder>();
  collectFolderClauses(query.expression, positive, negative);

  const folders =
    positive.size > 0
      ? positive
      : new Set<ImapSearchFolder>(["inbox", "junk", "archive"]);
  for (const folder of negative) folders.delete(folder);
  return folders;
};

const renderExpression = (expression: GmailSearchExpression): string => {
  if (expression.kind === "clause") return renderClause(expression);
  const items = expression.items
    .map(renderExpression)
    .filter((item) => item.length > 0);
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] as string;
  if (expression.kind === "and") return items.join(" ");

  let result = items[0] as string;
  for (const item of items.slice(1)) result = `OR ${result} ${item}`;
  return result;
};

const renderClause = (clause: GmailSearchClause): string => {
  if (isFolderClause(clause)) return "ALL";
  const criterion = renderClauseCriterion(clause);
  if (!criterion) return "ALL";
  return clause.negated ? `NOT ${criterion}` : criterion;
};

const renderClauseCriterion = (clause: GmailSearchClause): string => {
  switch (clause.field) {
    case "text":
      return `TEXT ${quoteImapString(clause.value)}`;
    case "from":
      return `FROM ${quoteImapString(clause.value)}`;
    case "to":
      return `TO ${quoteImapString(clause.value)}`;
    case "subject":
      return `SUBJECT ${quoteImapString(clause.value)}`;
    case "cc":
      return `HEADER Cc ${quoteImapString(clause.value)}`;
    case "bcc":
      return `HEADER Bcc ${quoteImapString(clause.value)}`;
    case "deliveredto":
      return `HEADER Delivered-To ${quoteImapString(clause.value)}`;
    case "after":
    case "newer":
    case "newer_than":
      return formatDateCriterion("SINCE", clause.value, clause.raw);
    case "before":
    case "older":
    case "older_than":
      return formatDateCriterion("BEFORE", clause.value, clause.raw);
    case "has":
      return clause.value.toLowerCase() === "attachment"
        ? `TEXT ${quoteImapString("Content-Disposition: attachment")}`
        : `TEXT ${quoteImapString(clause.value)}`;
    case "filename":
      return `TEXT ${quoteImapString(clause.value)}`;
    case "is":
      return renderIsCriterion(clause.value, clause.raw);
    case "larger":
      return renderSizeCriterion("LARGER", clause.value, clause.raw);
    case "smaller":
      return renderSizeCriterion("SMALLER", clause.value, clause.raw);
    case "size":
      return renderSizeCriterion("LARGER", clause.value, clause.raw);
    case "label":
    case "category":
    case "list":
    case "rfc822msgid":
      return `TEXT ${quoteImapString(clause.value)}`;
    case "in":
      return "";
    default:
      return `TEXT ${quoteImapString(clause.raw)}`;
  }
};

const isFolderClause = (clause: GmailSearchClause): boolean => {
  if (clause.field === "in") return true;
  return (
    clause.field === "is" &&
    ["spam", "trash"].includes(clause.value.toLowerCase())
  );
};

const formatDateCriterion = (
  operator: "SINCE" | "BEFORE",
  value: string,
  fallback: string,
): string => {
  const date = parseGmailSearchDate(value);
  if (!date) return `TEXT ${quoteImapString(fallback)}`;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][date.getUTCMonth()];
  return `${operator} ${day}-${month}-${date.getUTCFullYear()}`;
};

const renderIsCriterion = (value: string, fallback: string): string => {
  switch (value.toLowerCase()) {
    case "unread":
      return "UNSEEN";
    case "read":
      return "SEEN";
    case "starred":
      return "FLAGGED";
    case "unstarred":
      return "UNFLAGGED";
    default:
      return `TEXT ${quoteImapString(fallback)}`;
  }
};

const renderSizeCriterion = (
  operator: "LARGER" | "SMALLER",
  value: string,
  fallback: string,
): string => {
  const match = value.match(/^(\d+)([kmg])?$/i);
  if (!match) return `TEXT ${quoteImapString(fallback)}`;
  const multiplier =
    match[2]?.toLowerCase() === "g"
      ? 1024 ** 3
      : match[2]?.toLowerCase() === "m"
        ? 1024 ** 2
        : match[2]?.toLowerCase() === "k"
          ? 1024
          : 1;
  return `${operator} ${Number(match[1]) * multiplier}`;
};

const collectFolderClauses = (
  expression: GmailSearchExpression,
  positive: Set<ImapSearchFolder>,
  negative: Set<ImapSearchFolder>,
): void => {
  if (expression.kind === "clause") {
    const location = locationFromClause(expression);
    if (!location) return;
    if (location === "all") {
      const allFolders: ImapSearchFolder[] = [
        "inbox",
        "junk",
        "trash",
        "archive",
      ];
      for (const folder of allFolders)
        (expression.negated ? negative : positive).add(folder);
      return;
    }
    (expression.negated ? negative : positive).add(location);
    return;
  }
  for (const item of expression.items)
    collectFolderClauses(item, positive, negative);
};

const locationFromClause = (
  clause: GmailSearchClause,
): ImapSearchFolder | "all" | null => {
  const value = clause.value.toLowerCase();
  if (clause.field === "in") {
    switch (value) {
      case "inbox":
        return "inbox";
      case "spam":
      case "junk":
        return "junk";
      case "trash":
        return "trash";
      case "archive":
        return "archive";
      case "anywhere":
      case "all":
        return "all";
      default:
        return null;
    }
  }
  if (clause.field === "is") {
    if (value === "spam") return "junk";
    if (value === "trash") return "trash";
  }
  return null;
};
