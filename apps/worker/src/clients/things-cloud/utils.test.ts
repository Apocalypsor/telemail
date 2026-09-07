import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTaskPayload,
  deriveThingsUuid,
  generateThingsUuid,
  validateThingsUuid,
} from "./utils";

const secondId = "1111111111111112";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Things task encoding", () => {
  it("preserves all leading zero bytes in derived IDs", async () => {
    const bytes = new Uint8Array(32);
    bytes[15] = 1;
    vi.spyOn(crypto.subtle, "digest").mockResolvedValue(bytes.buffer);
    const id = await deriveThingsUuid("secret", "reminder:1");
    expect(id).toBe(secondId);
    expect(() => validateThingsUuid(id)).not.toThrow();
    expect(() => validateThingsUuid("2")).toThrow();
  });

  it("preserves all-zero random IDs and generates valid ordinary IDs", () => {
    expect(() => validateThingsUuid(generateThingsUuid())).not.toThrow();
    vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => array);
    expect(generateThingsUuid()).toBe("1111111111111111");
    expect(() => validateThingsUuid(generateThingsUuid())).not.toThrow();
  });

  it("uses the user's local date for Today across UTC midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T02:30:00Z"));
    const task = createTaskPayload({
      title: "Today",
      today: true,
      timeZone: "America/New_York",
    });
    expect(task).toMatchObject({
      st: 1,
      sr: Date.UTC(2026, 8, 6) / 1000,
      tir: Date.UTC(2026, 8, 6) / 1000,
      ato: null,
    });
  });
});
