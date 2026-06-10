# Worker — Agent Guide

Cloudflare Worker (Elysia + grammY). Cross-workspace rules in [root AGENTS.md](../../AGENTS.md).

Before changing worker behavior, inspect the current entry points and config instead of relying on this file as an inventory: `package.json`, `wrangler.example.jsonc`, `src/index.ts`, `src/api/index.ts`, `src/handlers/`, `src/containers/`, and the relevant provider/module files.

## Layout (`src/`)

- **`api/`** — HTTP layer (Elysia). Module / plugin file rules in root [AGENTS.md](../../AGENTS.md) "Elysia layout". Start at `api/index.ts` to see the current app composition and exported `App` type.
- **`bot/`** — Telegram bot (grammY). Self-contained tree, **no** sub-`services/`. Handler folders should stay focused on callback/command registration; shared or extracted bot helper code lives in `bot/utils/` with purpose-named files.
- **`handlers/`** — non-HTTP entry points (queue consumer + cron).
- **`clients/`** — outbound HTTP: shared `ky` instance + hand-written external API wrappers.
- **`containers/`** — Cloudflare Container host classes and Worker-internal container routing. Keep `Container` subclasses, `outboundByHost`, and container-only Worker endpoints here.
- **`providers/`** — email provider impls (Gmail / Outlook / IMAP), abstract base in `base.ts`. `index.ts` is the dispatcher (`PROVIDERS` map + helper fns); no barrel re-exports of classes or types. Per-provider differences stay on the class — **never `branch on account.type` outside `providers/`**.
- **`db/`** — D1 + KV access. Schema-typed wrappers only.
- **`utils/`** — pure helpers (formatters, crypto, encoders, thin lib wrappers), and cross-feature orchestration that has no single-module owner. Single-owner orchestration goes to that module's `service.ts`, not here.
- **`i18n/`** — translations.

Decision tree for a new file: public HTTP route → `api/modules/<feature>/`; Worker-internal container endpoint or Container subclass → `containers/`; bot command → `bot/handlers/`; new email provider → `providers/`; SQL/KV → `db/`; outbound API SDK → `clients/`; cross-cutting helper → `utils/`. Anything else used by only one consumer goes file-private next to it.

## Conventions

- **Aliases**: only three TS path aliases exist repo-wide — `@page/*` `@worker/*` `@middleware/*`, declared in root `tsconfig.base.json`. Worker-internal imports use `@worker/db/...` `@worker/bot/...` `@worker/utils/...` etc.; cross-package middleware access goes through `@middleware/index` (Eden treaty `App` type), `@middleware/constants` (pure bridge constants), and `@page/paths` (Mini App URL constants).
- **HTTP**: every generic outbound request goes through `@worker/clients/http` (a `ky` instance). Centralized retry / parse-fallback lives there. **IMAP middleware** is the exception — talk to it through the Eden treaty client at `@worker/providers/imap/utils/client`.
- **IMAP bridge client**: discover the current Worker ↔ middleware transport from `providers/imap/utils/client.ts`, `containers/imap-container.ts`, and middleware `src/index.ts`. Keep typed calls on Eden where possible. For raw streaming routes that Eden cannot model cleanly, use the existing bridge fetch helpers. Keep container-only Worker endpoints out of public `api/modules/`.
- **Env / waitUntil**: in Elysia handlers, destructure `{ env, executionCtx, waitUntil }` from context (provided by `cf` plugin). Queue, cron, and Container code receive `env` from the Worker runtime entry point and pass it explicitly to services/providers. Use `waitUntil` for side effects that should survive the response or current batch item.
- **Bot commands**: before adding command auth or chat-scope checks, inspect `bot/index.ts` for global guards and the relevant handler folder for local exceptions.
- **State reconciliation**: all "remote → TG" syncs go through `reconcileMessageState`; star pin goes through `syncStarPinState`. **Don't** patch state in multiple places.
- **Disable/enable**: `accounts.disabled` pauses an account without deleting data. Before adding a new account workflow, `rg "disabled" apps/worker/src` and preserve the existing enforcement pattern.
- **IMAP message id = RFC 822 Message-Id** (not the per-folder UID). The bridge takes `rfcMessageId` everywhere; UIDs aren't stable across folders. Emails without Message-Id are dropped. Gmail / Outlook keep their native ids.
- **Archive**: `provider.archiveMessage(id)` + `accountCanArchive(account)`. Gmail needs the user to pick a label (`accounts.archive_folder`); without one `canArchive()` returns false.
- **Cron**: inspect the scheduled handler and `wrangler.example.jsonc` for current triggers and time gates before changing cadence. Keep scheduling decisions centralized in the cron path instead of scattering timers across providers.
- **Email keyboard**: `buildEmailKeyboard` requires `tgMessageId`, so the delivery flow is send naked → insert message_map → build keyboard → `setReplyMarkup`. **One code path** covers both private chat and groups.
- **Reminders**: start from the reminder module, auth plugin, and cron handler before changing entry points or delivery behavior. Preserve threading under the original email unless the product flow changes deliberately.
