import { ThingsCloudClient } from "@worker/clients/things-cloud";
import {
  createTaskPayload,
  deriveThingsUuid,
  generateThingsUuid,
  validateThingsUuid,
} from "@worker/clients/things-cloud/utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const config = {
  email: "test@example.com",
  password: "test-password",
  appInstanceId: "test-instance",
  endpoint: "https://things.test",
};
const firstId = "BXmAcvS6yK1eDhW31MuZrL";
const secondId = "1111111111111112";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Things Cloud commits", () => {
  it("creates every task in one commit and refreshes the head after a conflict", async () => {
    const commits: Request[] = [];
    const bodies: unknown[] = [];
    let reads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        const url = new URL(request.url);
        if (url.pathname.includes("/account/")) {
          return Response.json({ "history-key": "history" });
        }
        if (url.pathname.endsWith("/items")) {
          reads++;
          return Response.json({ "current-item-index": reads === 1 ? 10 : 11 });
        }
        commits.push(request);
        bodies.push(await request.json());
        return commits.length === 1
          ? new Response(null, { status: 409 })
          : Response.json({ "server-head-index": 12 });
      }),
    );
    const ids = await new ThingsCloudClient(config).createTodos([
      { id: firstId, title: "First", today: true, notes: "中文 🚀" },
      { id: secondId, title: "Second", today: true },
    ]);
    expect(ids).toEqual([firstId, secondId]);
    expect(commits).toHaveLength(2);
    expect(
      commits.map((request) =>
        new URL(request.url).searchParams.get("ancestor-index"),
      ),
    ).toEqual(["10", "11"]);
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toMatchObject({
      [firstId]: {
        t: 0,
        e: "Task7",
        p: {
          tt: "First",
          md: null,
          rr: null,
          rp: null,
          rt: [],
          nt: { v: "中文 🚀" },
        },
      },
      [secondId]: { t: 0, e: "Task7", p: { tt: "Second" } },
    });
  });

  it.each([500, 401, 409])(
    "does not replay ambiguous/auth failures and bounds conflict retries (%s)",
    async (status) => {
      let commits = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (request: Request) => {
          if (request.url.includes("/account/"))
            return Response.json({ "history-key": "history" });
          if (request.url.includes("/items"))
            return Response.json({ "current-item-index": 10 });
          commits++;
          return new Response(null, { status });
        }),
      );
      await expect(
        new ThingsCloudClient(config).createTodo({
          id: firstId,
          title: "Task",
        }),
      ).rejects.toThrow();
      expect(commits).toBe(status === 409 ? 3 : 1);
    },
  );

  it.each([undefined, -1, 1.5, "10"])(
    "rejects a malformed history head (%s) before committing",
    async (head) => {
      const fetch = vi.fn(async (request: Request) =>
        request.url.includes("/account/")
          ? Response.json({ "history-key": "history" })
          : Response.json({ "current-item-index": head }),
      );
      vi.stubGlobal("fetch", fetch);
      await expect(
        new ThingsCloudClient(config).createTodo({
          id: firstId,
          title: "Task",
        }),
      ).rejects.toThrow("history head");
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it.each([undefined, 10, 9, 10.5])(
    "rejects an unconfirmed commit head (%s)",
    async (head) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (request: Request) => {
          if (request.url.includes("/account/"))
            return Response.json({ "history-key": "history" });
          if (request.url.includes("/items"))
            return Response.json({ "current-item-index": 10 });
          return Response.json({ "server-head-index": head });
        }),
      );
      await expect(
        new ThingsCloudClient(config).createTodo({
          id: firstId,
          title: "Task",
        }),
      ).rejects.toThrow("server head");
    },
  );

  it("rejects duplicate/invalid IDs and skips empty batches before any request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const client = new ThingsCloudClient(config);
    await expect(client.createTodos([])).resolves.toEqual([]);
    await expect(
      client.createTodos([
        { id: firstId, title: "A" },
        { id: firstId, title: "B" },
      ]),
    ).rejects.toThrow("duplicate");
    await expect(
      client.createTodo({ id: "invalid", title: "A" }),
    ).rejects.toThrow("Invalid Things task ID");
    expect(fetch).not.toHaveBeenCalled();
  });
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
