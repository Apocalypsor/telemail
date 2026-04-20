# Cloudflare Workers

> Before committing, run `pnpm check` (Biome) and `pnpm typecheck` (tsc). Fix ALL errors. Do NOT use `biome-ignore`. Update AGENTS.md and README.md if needed.

Your knowledge of Cloudflare Workers APIs may be outdated. Retrieve current docs before any Workers/KV/D1/Queues task: <https://developers.cloudflare.com/workers/>

## Commands

| Command           | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `pnpm dev`        | Build CSS + local development                 |
| `pnpm deploy`     | Build CSS + deploy to Cloudflare              |
| `pnpm check`      | Lint + format check (Biome)                   |
| `pnpm typecheck`  | TypeScript type checking (tsc --noEmit)       |
| `pnpm cf-typegen` | Generate TypeScript types from wrangler.jsonc |
| `pnpm build:css`  | Generate Tailwind CSS (src/assets/tailwind.ts)|

Run `pnpm cf-typegen` after changing bindings in wrangler.jsonc.

## Conventions

- **Layering**: `src/handlers/` only do routing / auth / req-resp shaping; business logic lives in `src/services/` or on a provider method.
- **Helpers & types**: shared helper functions go in `src/utils/`; shared interfaces / types go in `src/types.ts` (or a colocated `types.ts` for module-scoped shapes like `providers/types.ts`). Don't inline reusable helpers or interfaces into handlers/services.
- **Error reporting**: use `reportErrorToObservability()`, not `console.error`.
- **Email providers**: abstract class in `src/providers/base.ts`, shared interfaces in `src/providers/types.ts`, barrel in `src/providers/index.ts` (exports `PROVIDERS`, `getEmailProvider`, `accountCanArchive`). Each concrete provider (`gmail/`, `outlook/`, `imap/`) has its own `index.ts` class + `utils.ts` + optional `types.ts`.
- **Provider polymorphism**: never branch on `account.type` outside `providers/`. Per-provider differences live on the class — static metadata (`displayName`, `oauth`, `canArchive`), instance methods (fetch / list / archive / push / `resolveMessageState` / `onPersistedChange`), and `static registerRoutes(app)` for webhooks (so adding a provider needs no handler wiring).
- **IMAP message ids = RFC 822 Message-Id** (not per-folder UID). The bridge API takes `rfcMessageId` and `SEARCH HEADER Message-Id`s to resolve the current UID. Emails without Message-Id are dropped. Gmail/Outlook keep native ids.
- **Archive**: `provider.archiveMessage(messageId)` + `accountCanArchive(account)`. Gmail requires the user to pick a label (stored in `accounts.archive_folder` + `accounts.archive_folder_name`); without it `canArchive()` returns false.
- **State reconciliation**: all "remote → TG" syncs funnel through `reconcileMessageState` (`services/message-actions.ts`), which uses `provider.resolveMessageState` and either removes the TG msg (non-inbox) or syncs star/pin (inbox).
- **Star pin**: ⭐ email ↔ pinned TG msg. Single entry point: `syncStarPinState` in `services/message-actions.ts`. A `pin-cleanup` handler deletes TG's "Bot pinned" service messages.
- **Disable/enable**: `accounts.disabled` pauses without deleting. Enforced in `services/bridge.ts::processEmailMessage` (queue consumer) + filtered in push renewal / digest / mail-list / `/sync` / `getImapAccounts`.
- **Cron**: single `* * * * *` trigger. `handleScheduled` (`src/index.ts`) dispatches due reminders every minute; `getUTCMinutes() === 0` gates hourly batch (retry / health / digest); midnight renews pushes.
- **Mail preview helpers** (CID inlining, image proxy rewriting, token signing) live in `src/services/mail-preview.ts`.
- **Mini App** (`src/components/miniapp/`): three pages on the same TG domain.
  - `/telegram-app` → router, reads `start_param` (`r_<chat>_<msg>` / `m_<chat>_<msg>`) and redirects.
  - `/telegram-app/reminders` → set/list/cancel reminders.
  - `/telegram-app/mail/:id` → email preview, TG-themed.
  Private chat buttons are inline `web_app` pointing straight at subpage URLs. Group chat can't use `web_app` (TG 400s) — falls back to `url` deep links `t.me/<bot>/<short>?startapp=<feature>_<chat>_<msg>` which land on router; router calls `/api/reminders/resolve-context` to swap `(chatId, tgMsgId)` for `(accountId, messageId, token)`.
- **Email keyboard**: `buildEmailKeyboard` requires `tgMessageId`, so `deliverEmailToTelegram` sends the message naked, inserts `message_map`, then builds the keyboard and attaches it via `setReplyMarkup` — one code path for private + group. All other rebuild sites (refresh, toggle-star, reminder change, junk cancel) already have `tgMessageId`.
- **Reminders**: entry is exclusively through the ⏰ button on email messages (no `/remind` command). Auth on every API: `X-Telegram-Init-Data` via `utils/tg-init-data.ts::verifyTgInitData` + `users.approved`. Group deep-link resolve-context also checks `account.telegram_user_id === current user` (only the account owner can set reminders). Cron sends with `reply_parameters` so the reminder threads under the original email even if deleted.
  Setup: `WORKER_URL` env, BotFather `/setdomain`, `/newapp` to register the Mini App (so `?startapp=` works for group deep links).
