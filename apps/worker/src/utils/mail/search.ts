export type GmailSearchField =
  | "from"
  | "to"
  | "subject"
  | "cc"
  | "bcc"
  | "deliveredto"
  | "filename"
  | "label"
  | "in"
  | "is"
  | "has"
  | "after"
  | "before"
  | "older"
  | "newer"
  | "older_than"
  | "newer_than"
  | "larger"
  | "smaller"
  | "size"
  | "category"
  | "list"
  | "rfc822msgid";

export interface GmailSearchClause {
  kind: "clause";
  field: GmailSearchField | "text";
  value: string;
  raw: string;
  negated: boolean;
}

export type GmailSearchExpression =
  | GmailSearchClause
  | { kind: "and"; items: GmailSearchExpression[] }
  | { kind: "or"; items: GmailSearchExpression[] };

export interface ParsedGmailSearchQuery {
  raw: string;
  expression: GmailSearchExpression;
}

type SearchToken =
  | { kind: "value"; value: string; quoted: boolean }
  | { kind: "delimiter"; value: "(" | ")" | "{" | "}" };

const GMAIL_SEARCH_FIELDS = new Set<GmailSearchField>([
  "from",
  "to",
  "subject",
  "cc",
  "bcc",
  "deliveredto",
  "filename",
  "label",
  "in",
  "is",
  "has",
  "after",
  "before",
  "older",
  "newer",
  "older_than",
  "newer_than",
  "larger",
  "smaller",
  "size",
  "category",
  "list",
  "rfc822msgid",
]);

export const parseGmailSearchQuery = (
  rawQuery: string,
): ParsedGmailSearchQuery => {
  const raw = rawQuery.trim();
  const tokens = tokenizeSearchQuery(raw);
  let index = 0;

  const parseOr = (end: ")" | "}" | undefined): GmailSearchExpression => {
    const items: GmailSearchExpression[] = [parseAnd(end)];
    while (isOrToken(tokens[index])) {
      index += 1;
      items.push(parseAnd(end));
    }
    return combineExpression("or", items);
  };

  const parseAnd = (end: ")" | "}" | undefined): GmailSearchExpression => {
    const items: GmailSearchExpression[] = [];
    while (index < tokens.length) {
      const token = tokens[index];
      if (isEndToken(token, end) || isOrToken(token)) break;

      index += 1;
      if (token.kind === "delimiter" && token.value === "(") {
        items.push(parseOr(")"));
        consumeDelimiter(")");
        continue;
      }
      if (token.kind === "delimiter" && token.value === "{") {
        const group = parseOr("}");
        consumeDelimiter("}");
        items.push(asOrExpression(group));
        continue;
      }
      if (token.kind === "value") items.push(parseClause(token));
    }
    return combineExpression("and", items);
  };

  const consumeDelimiter = (value: ")" | "}"): void => {
    const token = tokens[index];
    if (token?.kind === "delimiter" && token.value === value) index += 1;
  };

  const expression = raw ? parseOr(undefined) : emptySearchExpression();
  return { raw, expression };

  function parseClause(token: Extract<SearchToken, { kind: "value" }>) {
    const original = token.value;
    let value = original;
    let negated = false;
    while (value.startsWith("-")) {
      negated = !negated;
      value = value.slice(1);
    }

    const separator = value.indexOf(":");
    const fieldName = separator > 0 ? value.slice(0, separator) : "";
    const normalizedField = fieldName.toLowerCase() as GmailSearchField;
    if (separator > 0 && GMAIL_SEARCH_FIELDS.has(normalizedField)) {
      return {
        kind: "clause" as const,
        field: normalizedField,
        value: value.slice(separator + 1),
        raw: original,
        negated,
      };
    }

    return {
      kind: "clause" as const,
      field: "text" as const,
      value: value || original,
      raw: original,
      negated,
    };
  }
};

export const parseGmailSearchDate = (
  value: string,
  now: Date = new Date(),
): Date | null => {
  const absolute = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (absolute) {
    const date = new Date(
      Date.UTC(
        Number(absolute[1]),
        Number(absolute[2]) - 1,
        Number(absolute[3]),
      ),
    );
    return isSameCalendarDate(date, absolute) ? date : null;
  }

  const epochSeconds = value.match(/^\d{9,}$/);
  if (epochSeconds) {
    const date = new Date(Number(value) * 1000);
    return Number.isNaN(date.getTime()) ? null : startOfUtcDay(date);
  }

  const relative = value.match(/^(\d+)([dmy])$/i);
  if (!relative) return null;

  const date = startOfUtcDay(now);
  const amount = Number(relative[1]);
  switch (relative[2]?.toLowerCase()) {
    case "d":
      date.setUTCDate(date.getUTCDate() - amount);
      break;
    case "m":
      date.setUTCMonth(date.getUTCMonth() - amount);
      break;
    case "y":
      date.setUTCFullYear(date.getUTCFullYear() - amount);
      break;
    default:
      return null;
  }
  return date;
};

const tokenizeSearchQuery = (query: string): SearchToken[] => {
  const tokens: SearchToken[] = [];
  let index = 0;

  while (index < query.length) {
    const char = query[index];
    if (!char || /\s/.test(char)) {
      index += 1;
      continue;
    }
    if (isDelimiter(char)) {
      tokens.push({ kind: "delimiter", value: char });
      index += 1;
      continue;
    }

    let value = "";
    let quoted = false;
    while (index < query.length) {
      const current = query[index];
      if (!current || /\s/.test(current) || isDelimiter(current)) break;
      if (current === '"') {
        quoted = true;
        index += 1;
        while (index < query.length) {
          const quotedChar = query[index];
          if (quotedChar === "\\" && index + 1 < query.length) {
            value += query[index + 1];
            index += 2;
            continue;
          }
          if (quotedChar === '"') {
            index += 1;
            break;
          }
          value += quotedChar ?? "";
          index += 1;
        }
        continue;
      }
      if (current === "\\" && index + 1 < query.length) {
        value += query[index + 1];
        index += 2;
        continue;
      }
      value += current;
      index += 1;
    }
    if (value) tokens.push({ kind: "value", value, quoted });
  }
  return tokens;
};

const isDelimiter = (value: string): value is "(" | ")" | "{" | "}" =>
  /[(){}]/.test(value);

const isOrToken = (token: SearchToken | undefined): boolean => {
  return token?.kind === "value" && !token.quoted && token.value === "OR";
};

const isEndToken = (
  token: SearchToken | undefined,
  end: ")" | "}" | undefined,
): boolean => {
  return token?.kind === "delimiter" && token.value === end;
};

const combineExpression = (
  kind: "and" | "or",
  items: GmailSearchExpression[],
): GmailSearchExpression => {
  const filtered = items.filter((item) => !isEmptySearchExpression(item));
  if (filtered.length === 0) return emptySearchExpression();
  if (filtered.length === 1) return filtered[0] as GmailSearchExpression;
  return { kind, items: filtered };
};

const asOrExpression = (
  expression: GmailSearchExpression,
): GmailSearchExpression => {
  if (expression.kind === "and")
    return combineExpression("or", expression.items);
  return expression;
};

const emptySearchExpression = (): GmailSearchExpression => ({
  kind: "and",
  items: [],
});

const isEmptySearchExpression = (
  expression: GmailSearchExpression,
): boolean => {
  return (
    (expression.kind === "and" || expression.kind === "or") &&
    expression.items.length === 0
  );
};

const startOfUtcDay = (date: Date): Date => {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
};

const isSameCalendarDate = (date: Date, match: RegExpMatchArray): boolean => {
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  );
};
