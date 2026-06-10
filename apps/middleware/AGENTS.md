# Middleware — Agent Guide

IMAP bridge (Bun + Elysia + ImapFlow). Cross-workspace rules in [root AGENTS.md](../../AGENTS.md).

Before changing middleware behavior, follow root "Explore first"; start from the current runtime config, entrypoint, connection manager, state helpers, auth layer, and worker-side bridge routes. Do not rely on this file for runtime topology, interval defaults, or bridge route inventory.

## Conventions

- **Bridge state**: inspect the current state helpers and worker-side bridge endpoints before adding state reads/writes. Do not add a second persistence backend unless you are deliberately replacing the current pattern end to end.
- **Periodic refresh**: cadence comes from current config. The purpose is to close + reconnect clients so IDLE does not silently stale on providers that behave poorly.
- **Reconnect is manual**: ImapFlow doesn't auto-reconnect. Preserve the close → scheduled reconnect → fresh `ImapFlow` instance pattern, including one timer guard per account to prevent stacking.
- **Stale client guard**: when registering an event handler, **capture the current `ImapFlow` ref** and ignore events from old clients — preserve this pattern when adding new handlers.
- **Bridge HTTP surface**: respect the current Worker ↔ middleware auth and transport. Don't expose email addresses/passwords in responses.
- **Exported app type**: the middleware Elysia app type is a worker-facing contract. Treat route paths, body schemas, and return shapes as public API.
- **Imports / aliases**: use the root alias rules; do not repeat or add workspace-specific shortcuts here.

## ImapFlow specifics ([docs](https://imapflow.com/docs/guides/basic-usage/))

- **Auto-IDLE**: enters IDLE after 15s with no command, sends `DONE` automatically before any command. **Don't manage IDLE manually.**
- **No-IDLE fallback**: preserve the current fallback command unless you have tested the target IMAP servers.
- **Never run an IMAP command inside a `fetch()` iterator** — it deadlocks.
- **Always pass `{ uid: true }` to `fetch` / `search`** — UIDs are stable across sessions, sequence numbers aren't.
- **Lock discipline**: after `getMailboxLock()`, always `try { ... } finally { lock.release() }`.
- **Special-use flags**: get `\Inbox` `\Sent` `\Drafts` `\Trash` `\Junk` `\Archive` from `client.list()`. **Don't hardcode** folder names.
