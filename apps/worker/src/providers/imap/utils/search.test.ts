import { parseGmailSearchQuery } from "@worker/utils/mail/search";
import { describe, expect, it } from "vitest";
import { buildImapSearchCriteria, getImapSearchFolders } from "./search";

describe("IMAP Gmail search translation", () => {
  it("translates common Gmail fields into IMAP criteria", () => {
    const query = parseGmailSearchQuery(
      "from:alice@example.com after:2026/02/01 is:unread",
    );

    expect(buildImapSearchCriteria(query)).toBe(
      'FROM "alice@example.com" SINCE 01-Feb-2026 UNSEEN',
    );
  });

  it("uses the Gmail location operator to choose folders", () => {
    expect([...getImapSearchFolders(parseGmailSearchQuery("in:spam"))]).toEqual(
      ["junk"],
    );
    expect(
      [...getImapSearchFolders(parseGmailSearchQuery("in:anywhere"))].sort(),
    ).toEqual(["archive", "inbox", "junk", "trash"]);
  });
});
