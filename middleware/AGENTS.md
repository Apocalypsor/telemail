# Middleware — Agent Guide

IMAP bridge (Bun + Elysia + ImapFlow + optional Redis). **Doesn't run on Cloudflare** — Workers don't have native TCP / persistent sockets, so IDLE can't run there. This service holds IMAP connections on the user's behalf and pushes "new email arrived" events to the worker. Cross-workspace rules in [root AGENTS.md](../AGENTS.md).

## Conventions

- **Redis is optional**: with `REDIS_URL` set → per-account `lastUid` survives restart; without it → in-memory only.
- **Periodic refresh** (`REFRESH_INTERVAL_MS`, default 5 min): close + reconnect every client to prevent IDLE from going silently stale (servers like iCloud do this often).
- **Reconnect is manual**: ImapFlow doesn't auto-reconnect. `close` event → `scheduleReconnect` → wait `RECONNECT_DELAY_MS` (3s) → fresh `ImapFlow` instance. One timer guard per account prevents stacking.
- **Stale client guard**: when registering an event handler, **capture the current `ImapFlow` ref** and ignore events from old clients — preserve this pattern when adding new handlers.
- **Health endpoint isn't authenticated**: returns only `{ ok, total, usable }` counts. **Never** expose email addresses or passwords.
- **`src/index.ts` exports `app` and `App` type**: the worker imports `import type { App } from "@middleware/index"` and drives the bridge through Eden treaty. Treat the route surface (`/api/*` paths, body schemas, return shapes) as a public contract — renaming a route or changing a body schema breaks worker compile-time.
- **Aliases**: only three TS path aliases exist repo-wide — `@page/*` `@worker/*` `@middleware/*`, declared in root `tsconfig.base.json`. Internal imports here use `@middleware/connections` `@middleware/plugins/auth` `@middleware/utils/redis` etc. —— same prefix worker would use for cross-package access, so files don't change meaning when read from another tsconfig.

## ImapFlow specifics ([docs](https://imapflow.com/docs/guides/basic-usage/))

- **Auto-IDLE**: enters IDLE after 15s with no command, sends `DONE` automatically before any command. **Don't manage IDLE manually.**
- **No-IDLE fallback**: we pass `missingIdleCommand: "STATUS"` (the default `NOOP` is unreliable, `SELECT` loops).
- **Never run an IMAP command inside a `fetch()` iterator** — it deadlocks.
- **Always pass `{ uid: true }` to `fetch` / `search`** — UIDs are stable across sessions, sequence numbers aren't.
- **Lock discipline**: after `getMailboxLock()`, always `try { ... } finally { lock.release() }`.
- **Special-use flags**: get `\Inbox` `\Sent` `\Drafts` `\Trash` `\Junk` `\Archive` from `client.list()`. **Don't hardcode** folder names.
