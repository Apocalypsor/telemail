import { describe, expect, it } from "vitest";
import { sortEmailListItemsByDateDesc } from "./utils";

describe("sortEmailListItemsByDateDesc", () => {
  it("orders dated items newest first and keeps undated items last", () => {
    const items = [
      { id: "undated" },
      { id: "old", date: "2026-01-01T00:00:00.000Z" },
      { id: "new", date: "2026-02-01T00:00:00.000Z" },
    ];

    expect(sortEmailListItemsByDateDesc(items).map((item) => item.id)).toEqual([
      "new",
      "old",
      "undated",
    ]);
  });
});
