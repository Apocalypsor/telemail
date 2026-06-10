# Worker — Agent Guide

Cloudflare Worker (Elysia + grammY). Cross-workspace rules in [root AGENTS.md](../../AGENTS.md).

## Layout (`src/`)

- **`api/`** — HTTP layer (Elysia). Module / plugin file rules in root [AGENTS.md](../../AGENTS.md) "Elysia layout". `api/index.ts` composes the tree with `CloudflareAdapter` + `.compile()` and exports `type App` for Eden.
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
- **IMAP bridge client**: Worker → middleware goes through `bridgeClient` / `bridgeCall` in `providers/imap/utils/client.ts`, typed against `import type { App } from "@middleware/index"` and backed by the `IMAP_BRIDGE_CONTAINER` binding. Treaty config sets `throwHttpError: true` so non-2xx auto-throws `EdenFetchError`. For raw streaming routes that Eden cannot model cleanly, use `bridgeFetch` + `bridgeRequestUrl`. Middleware → Worker uses `ImapBridgeContainer.outboundByHost` in `containers/imap-container.ts`; keep those container-only endpoints out of `api/modules/`.
- **Env / waitUntil**: in Elysia handlers, destructure `{ env, executionCtx, waitUntil }` from context (provided by `cf` plugin). Queue, cron, and Container code receive `env` from the Worker runtime entry point and pass it explicitly to services/providers. Use `waitUntil` for side effects that should survive the response or current batch item.
- **Bot commands**: private chat only by default — `bot/index.ts` registers `registerPrivateOnlyCommandGuard` as a global guard (also covers `channel_post`). New commands don't need to re-check; `callback_query` is unaffected.
- **State reconciliation**: all "remote → TG" syncs go through `reconcileMessageState`; star pin goes through `syncStarPinState`. **Don't** patch state in multiple places.
- **Disable/enable**: `accounts.disabled` pauses an account without deleting data. Enforcement points include the queue consumer, push renewal, Mini App mail lists, manual sync callback, and `getImapAccounts`.
- **IMAP message id = RFC 822 Message-Id** (not the per-folder UID). The bridge takes `rfcMessageId` everywhere; UIDs aren't stable across folders. Emails without Message-Id are dropped. Gmail / Outlook keep their native ids.
- **Archive**: `provider.archiveMessage(id)` + `accountCanArchive(account)`. Gmail needs the user to pick a label (`accounts.archive_folder`); without one `canArchive()` returns false.
- **Cron**: single `* * * * *` trigger. Reminders dispatch every minute; daily summary checks every 15 minutes; IMAP bridge health runs every 5 minutes; `minute === 0` gates hourly retry work; UTC midnight renews all push subscriptions.
- **Email keyboard**: `buildEmailKeyboard` requires `tgMessageId`, so the delivery flow is send naked → insert message_map → build keyboard → `setReplyMarkup`. **One code path** covers both private chat and groups.
- **Reminders**: the only entry is the ⏰ button on email messages. Auth: `X-Telegram-Init-Data` + `users.approved`; group deep-link also verifies `account.telegram_user_id === current user`. Cron sends with `reply_parameters` so reminders thread under the original email.
