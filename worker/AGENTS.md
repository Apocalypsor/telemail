# Worker — Agent Guide

Cloudflare Worker (Elysia + grammY). Cross-workspace rules in [root AGENTS.md](../AGENTS.md).

## Layout (`src/`)

- **`api/`** — HTTP layer (Elysia). Module / plugin file rules in root [AGENTS.md](../AGENTS.md) "Elysia layout". `api/index.ts` composes the tree with `CloudflareAdapter` + `.compile()` and exports `type App` for Eden.
- **`bot/`** — Telegram bot (grammY). Self-contained tree, **no** sub-`services/`. Helpers live in the **nearest** `utils/`: feature-internal (≥2 files inside one `handlers/<feature>/`) → `bot/handlers/<feature>/utils.ts`; cross-feature → `bot/utils/`.
- **`handlers/`** — non-HTTP entry points (queue consumer + cron).
- **`clients/`** — outbound HTTP: shared `ky` instance + hand-written external API wrappers.
- **`providers/`** — email provider impls (Gmail / Outlook / IMAP), abstract base in `base.ts`. `index.ts` is the dispatcher (`PROVIDERS` map + helper fns); no barrel re-exports of classes or types. Per-provider differences stay on the class — **never `branch on account.type` outside `providers/`**.
- **`db/`** — D1 + KV access. Schema-typed wrappers only.
- **`utils/`** — pure helpers (formatters, crypto, encoders, thin lib wrappers), and cross-feature orchestration that has no single-module owner. Single-owner orchestration goes to that module's `service.ts`, not here.
- **`i18n/`** — translations.

Decision tree for a new file: HTTP route → `api/modules/<feature>/`; bot command → `bot/handlers/`; new email provider → `providers/`; SQL/KV → `db/`; outbound API SDK → `clients/`; cross-cutting helper → `utils/`. Anything else used by only one consumer goes file-private next to it.

## Conventions

- **Aliases**: only three TS path aliases exist repo-wide — `@page/*` `@worker/*` `@middleware/*`, declared in root `tsconfig.base.json`. Worker-internal imports use `@worker/db/...` `@worker/bot/...` `@worker/utils/...` etc.; cross-package middleware access goes through `@middleware/index` (Eden treaty `App` type) and `@page/paths` (Mini App URL constants).
- **HTTP**: every generic outbound request goes through `@worker/clients/http` (a `ky` instance). No raw `fetch`. Centralized retry / parse-fallback lives there. **IMAP middleware** is the exception — talk to it through the Eden treaty client at `@worker/providers/imap/utils` (see below).
- **IMAP bridge client**: talk to middleware through Eden treaty (`bridgeClient` / `bridgeCall` in `providers/imap/`), typed against `import type { App } from "@middleware/index"`. Treaty config sets `throwHttpError: true` so non-2xx auto-throws `EdenFetchError`. Never construct middleware URLs by hand.
- **Env / waitUntil**: in Elysia handlers, destructure `{ env, executionCtx, waitUntil }` from context (provided by `cf` plugin). Outside HTTP context, `import { env } from "cloudflare:workers"`. Don't pass `env: Env` through new function signatures unless interfacing with framework-agnostic services.
- **Bot commands**: private chat only by default — `bot/index.ts` registers `registerPrivateOnlyCommandGuard` as a global guard (also covers `channel_post`). New commands don't need to re-check; `callback_query` is unaffected.
- **State reconciliation**: all "remote → TG" syncs go through `reconcileMessageState`; star pin goes through `syncStarPinState`. **Don't** patch state in multiple places.
- **Disable/enable**: `accounts.disabled` pauses an account without deleting data. Enforcement points include the queue consumer, push renewal, mail-list, `/sync`, and `getImapAccounts`.
- **IMAP message id = RFC 822 Message-Id** (not the per-folder UID). The bridge takes `rfcMessageId` everywhere; UIDs aren't stable across folders. Emails without Message-Id are dropped. Gmail / Outlook keep their native ids.
- **Archive**: `provider.archiveMessage(id)` + `accountCanArchive(account)`. Gmail needs the user to pick a label (`accounts.archive_folder`); without one `canArchive()` returns false.
- **Cron**: single `* * * * *` trigger. Reminders dispatch every minute; `getUTCMinutes() === 0` gates the hourly batch; midnight renews all push subscriptions.
- **Email keyboard**: `buildEmailKeyboard` requires `tgMessageId`, so the delivery flow is send naked → insert message_map → build keyboard → `setReplyMarkup`. **One code path** covers both private chat and groups.
- **Reminders**: the only entry is the ⏰ button on email messages. Auth: `X-Telegram-Init-Data` + `users.approved`; group deep-link also verifies `account.telegram_user_id === current user`. Cron sends with `reply_parameters` so reminders thread under the original email.
