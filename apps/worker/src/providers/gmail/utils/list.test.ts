import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gmailBatchGetMetadata: vi.fn(),
  gmailGet: vi.fn(),
}));

vi.mock("@worker/providers/gmail/utils/api", () => ({
  gmailGet: mocks.gmailGet,
}));
vi.mock("@worker/providers/gmail/utils/batch", () => ({
  gmailBatchGetMetadata: mocks.gmailBatchGetMetadata,
}));

import { listGmailMessagesByQueryPage } from "./list";

describe("listGmailMessagesByQueryPage", () => {
  it("passes Gmail search syntax through and sorts metadata by internal date", async () => {
    mocks.gmailGet.mockResolvedValue({
      messages: [{ id: "old" }, { id: "new" }],
      nextPageToken: "next-page",
    });
    mocks.gmailBatchGetMetadata.mockResolvedValue(
      new Map([
        [
          "old",
          {
            id: "old",
            internalDate: "1767225600000",
            payload: {
              headers: [
                { name: "Subject", value: "Old" },
                { name: "Date", value: "Thu, 01 Jan 2026 00:00:00 +0000" },
              ],
            },
          },
        ],
        [
          "new",
          {
            id: "new",
            internalDate: "1769904000000",
            payload: {
              headers: [
                { name: "Subject", value: "New" },
                { name: "Date", value: "Fri, 01 Feb 2026 00:00:00 +0000" },
              ],
            },
          },
        ],
      ]),
    );

    const query = "from:alice@example.com after:2026/01/01";
    const result = await listGmailMessagesByQueryPage(
      "token",
      query,
      20,
      undefined,
    );

    const requestPath = String(mocks.gmailGet.mock.calls[0]?.[1]);
    expect(
      new URL(`https://gmail.test${requestPath}`).searchParams.get("q"),
    ).toBe(query);
    expect(mocks.gmailBatchGetMetadata).toHaveBeenCalledWith(
      "token",
      ["old", "new"],
      ["Subject", "From", "To", "Date"],
    );
    expect(result.items.map((item) => item.id)).toEqual(["new", "old"]);
    expect(result.nextCursor).toBe("next-page");
  });
});
