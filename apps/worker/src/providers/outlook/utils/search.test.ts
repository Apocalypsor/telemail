import { parseGmailSearchQuery } from "@worker/utils/mail/search";
import { describe, expect, it } from "vitest";
import {
  buildOutlookSearchQuery,
  getOutlookSearchFilter,
  getOutlookSearchFolder,
} from "./search";

describe("Outlook Gmail search translation", () => {
  it("translates Gmail fields into Graph KQL", () => {
    const query = parseGmailSearchQuery(
      "from:alice@example.com after:2026/02/01 has:attachment",
    );

    expect(buildOutlookSearchQuery(query)).toBe(
      "from:alice@example.com AND received>=02/01/2026 AND hasAttachments:true",
    );
  });

  it("maps Gmail locations to Outlook folders", () => {
    expect(getOutlookSearchFolder(parseGmailSearchQuery("in:trash"))).toBe(
      "DeletedItems",
    );
  });

  it("filters Outlook flags for Gmail star operators", () => {
    const filter = getOutlookSearchFilter(parseGmailSearchQuery("is:starred"));

    expect(filter?.({ id: "flagged", flag: { flagStatus: "flagged" } })).toBe(
      true,
    );
    expect(filter?.({ id: "clear", flag: { flagStatus: "notFlagged" } })).toBe(
      false,
    );
  });
});
