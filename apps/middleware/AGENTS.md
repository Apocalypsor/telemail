# Middleware — Agent Guide

IMAP bridge (Bun + Elysia + ImapFlow). Cross-workspace rules in [root AGENTS.md](../../AGENTS.md).

Before changing middleware behavior, inspect the current `package.json`, Dockerfile, `src/index.ts`, `src/config.ts`, connection manager, state helpers, and worker-side container host. Do not rely on this file for runtime topology, interval defaults, or bridge route inventory.

## Conventions

- **Bridge state**: inspect `@middleware/utils/state` and the worker-side bridge endpoints before adding state reads/writes. Do not add a second persistence backend unless you are deliberately replacing the current pattern end to end.
- **Periodic refresh**: cadence comes from current config. The purpose is to close + reconnect clients so IDLE does not silently stale on providers that behave poorly.
- **Reconnect is manual**: ImapFlow doesn't auto-reconnect. Preserve the close → scheduled reconnect → fresh `ImapFlow` instance pattern, including one timer guard per account to prevent stacking.
- **Stale client guard**: when registering an event handler, **capture the current `ImapFlow` ref** and ignore events from old clients — preserve this pattern when adding new handlers.
- **Container-only HTTP surface**: middleware routes are intended to be reached only through the current Worker/container transport. Inspect Worker config for the binding name before touching it. Don't add a public deployment path or expose email addresses/passwords in responses.
- **`src/index.ts` exports `app` and `App` type**: the worker imports `import type { App } from "@middleware/index"` and drives the bridge through Eden treaty. Treat the route surface (`/api/*` paths, body schemas, return shapes) as a public contract — renaming a route or changing a body schema breaks worker compile-time.
- **Aliases**: only three TS path aliases exist repo-wide — `@page/*` `@worker/*` `@middleware/*`, declared in root `tsconfig.base.json`. Internal imports here use `@middleware/connections`, `@middleware/constants`, `@middleware/utils/state`, etc. —— same prefix worker would use for cross-package access, so files don't change meaning when read from another tsconfig.

## ImapFlow specifics ([docs](https://imapflow.com/docs/guides/basic-usage/))

- **Auto-IDLE**: enters IDLE after 15s with no command, sends `DONE` automatically before any command. **Don't manage IDLE manually.**
- **No-IDLE fallback**: we pass `missingIdleCommand: "STATUS"` (the default `NOOP` is unreliable, `SELECT` loops).
- **Never run an IMAP command inside a `fetch()` iterator** — it deadlocks.
- **Always pass `{ uid: true }` to `fetch` / `search`** — UIDs are stable across sessions, sequence numbers aren't.
- **Lock discipline**: after `getMailboxLock()`, always `try { ... } finally { lock.release() }`.
- **Special-use flags**: get `\Inbox` `\Sent` `\Drafts` `\Trash` `\Junk` `\Archive` from `client.list()`. **Don't hardcode** folder names.
