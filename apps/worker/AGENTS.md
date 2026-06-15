# Worker — Agent Guide

Cloudflare Worker (Elysia + grammY). Cross-workspace rules in [root AGENTS.md](../../AGENTS.md).

Before changing worker behavior, follow root "Explore first"; start from the current Worker entrypoint, runtime config, handlers, and the relevant provider/module files.

## Layout (`src/`)

- **`api/`** — HTTP layer (Elysia). Module / plugin file rules in root [AGENTS.md](../../AGENTS.md) "Elysia layout". Start at `api/index.ts` to see the current app composition and exported `App` type.
- **`bot/`** — Telegram bot (grammY). Self-contained tree, **no** sub-`services/`. Handler folders should stay focused on callback/command registration; shared or extracted bot helper code lives in `bot/utils/` with purpose-named files.
- **`handlers/`** — non-HTTP entry points (queue consumer + cron).
- **`clients/`** — outbound HTTP: shared `ky` instance + hand-written external API wrappers.
- **`providers/`** — email provider impls (Gmail / Outlook / IMAP), abstract base in `base.ts`. `index.ts` is the dispatcher (`PROVIDERS` map + helper fns); no barrel re-exports of classes or types. Per-provider differences stay on the class — **never `branch on account.type` outside `providers/`**.
- **`db/`** — D1 + KV access. Schema-typed wrappers only.
- **`utils/`** — pure helpers (formatters, crypto, encoders, thin lib wrappers), and cross-feature orchestration that has no single-module owner. Single-owner orchestration goes to that module's `service.ts`, not here.
- **`i18n/`** — translations.

Decision tree for a new file: public HTTP route → `api/modules/<feature>/`; bot command → `bot/handlers/`; new email provider → `providers/`; SQL/KV → `db/`; outbound API SDK → `clients/`; cross-cutting helper → `utils/`. Anything else used by only one consumer goes file-private next to it.

## Conventions

- **Imports / aliases**: use the root alias rules; do not repeat or add workspace-specific shortcuts here.
- **HTTP**: generic outbound requests use the existing worker HTTP client. Provider-specific transports stay in that provider's established utility files.
- **IMAP transport**: IMAP accounts are handled inside the Worker. Cloudflare Email Routing provides the push signal; provider methods open short-lived IMAP socket connections on demand for reads and message actions.
- **Env / waitUntil**: in Elysia handlers, destructure `{ env, executionCtx, waitUntil }` from context (provided by `cf` plugin). Queue and cron code receive `env` from the Worker runtime entry point and pass it explicitly to services/providers. Use `waitUntil` for side effects that should survive the response or current batch item.
- **Bot commands**: before adding command auth or chat-scope checks, inspect `bot/index.ts` for global guards and the relevant handler folder for local exceptions.
- **State reconciliation**: all "remote → TG" syncs go through `reconcileMessageState`; star pin goes through `syncStarPinState`. **Don't** patch state in multiple places.
- **Disable/enable**: `accounts.disabled` pauses an account without deleting data. Before adding a new account workflow, `rg "disabled" apps/worker/src` and preserve the existing enforcement pattern.
- **IMAP message id = RFC 822 Message-Id** (not the per-folder UID). Provider methods search `HEADER Message-ID` in the relevant mailbox; UIDs aren't stable across folders. Forwarded emails without Message-Id are rejected. Gmail / Outlook keep their native ids.
- **Archive**: `provider.archiveMessage(id)` + `accountCanArchive(account)`. Gmail needs the user to pick a label (`accounts.archive_folder`); without one `canArchive()` returns false.
- **Cron**: inspect the scheduled handler and current runtime config for triggers and time gates before changing cadence. Keep scheduling decisions centralized in the cron path instead of scattering timers across providers.
- **Email keyboard**: `buildEmailKeyboard` requires `tgMessageId`, so the delivery flow is send naked → insert message_map → build keyboard → `setReplyMarkup`. **One code path** covers both private chat and groups.
- **Reminders**: start from the reminder module, auth plugin, and cron handler before changing entry points or delivery behavior. Preserve threading under the original email unless the product flow changes deliberately.
