import { describe, expect, it } from "vitest";
import { parseGmailSearchDate, parseGmailSearchQuery } from "./search";

describe("parseGmailSearchQuery", () => {
  it("parses Gmail fields, quoted values, and negation", () => {
    const query = parseGmailSearchQuery(
      'from:alice@example.com subject:"status report" -is:read',
    );

    expect(query.raw).toBe(
      'from:alice@example.com subject:"status report" -is:read',
    );
    expect(query.expression).toEqual({
      kind: "and",
      items: [
        {
          kind: "clause",
          field: "from",
          value: "alice@example.com",
          raw: "from:alice@example.com",
          negated: false,
        },
        {
          kind: "clause",
          field: "subject",
          value: "status report",
          raw: "subject:status report",
          negated: false,
        },
        {
          kind: "clause",
          field: "is",
          value: "read",
          raw: "-is:read",
          negated: true,
        },
      ],
    });
  });

  it("supports OR and Gmail brace groups", () => {
    const query = parseGmailSearchQuery(
      "from:alice@example.com OR {from:bob@example.com subject:report}",
    );

    expect(query.expression).toEqual({
      kind: "or",
      items: [
        {
          kind: "clause",
          field: "from",
          value: "alice@example.com",
          raw: "from:alice@example.com",
          negated: false,
        },
        {
          kind: "or",
          items: [
            {
              kind: "clause",
              field: "from",
              value: "bob@example.com",
              raw: "from:bob@example.com",
              negated: false,
            },
            {
              kind: "clause",
              field: "subject",
              value: "report",
              raw: "subject:report",
              negated: false,
            },
          ],
        },
      ],
    });
  });
});

describe("parseGmailSearchDate", () => {
  it("supports absolute and relative Gmail dates", () => {
    expect(parseGmailSearchDate("2026/02/03")?.toISOString()).toBe(
      "2026-02-03T00:00:00.000Z",
    );
    expect(
      parseGmailSearchDate(
        "7d",
        new Date("2026-02-10T12:00:00.000Z"),
      )?.toISOString(),
    ).toBe("2026-02-03T00:00:00.000Z");
  });
});
