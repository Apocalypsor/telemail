# Telemail — Agent Guide

> **Before commit**: `bun check` (Biome) and `bun typecheck` (tsc). Fix all errors. Don't use `biome-ignore`. Update `README.md` / `docs/*` when you change behavior they describe.

User-facing docs:

- `README.md` — landing, stack, architecture
- `docs/DEVELOPMENT.md` — local dev commands + flow
- `docs/DEPLOYMENT.md` — end-to-end CF deploy + IMAP middleware deploy + CI/CD section
- `docs/ENVIRONMENT.md` — secrets / bindings / D1 schema reference

Cloudflare API knowledge may be stale — fetch <https://developers.cloudflare.com/workers/> before any Workers/KV/D1/Queues task.

## Workspaces (bun monorepo)

- **`worker/`** (`telemail-worker`) — Cloudflare Worker (Hono): bot webhook, queue consumer, cron, email providers, D1, `/api/*` + `/oauth/*`. Owns `wrangler.example.jsonc` (committed template) + `migrations/`. Real `wrangler.jsonc` is gitignored — generated locally by copy + manual edit, generated in CI by `envsubst < wrangler.example.jsonc > wrangler.jsonc` using `CF_D1_DATABASE_ID` + `CF_KV_NAMESPACE_ID` secrets.
- **`page/`** (`telemail-page`) — Cloudflare Pages SPA (Vite + React 19 + TanStack Router/Query + HeroUI + ky + zod). Single entry serves both browser web pages (`/mail/$id`, `/preview`, `/junk-check`, `/login`, `/`) and Mini App routes (`/telegram-app/*`).
- **`middleware/`** (`telemail-middleware`) — IMAP bridge (Bun + Elysia + ImapFlow + optional Redis). NOT on Cloudflare. Built into a single `bun build --compile` binary, packaged as a multi-arch docker image pushed to `ghcr.io/apocalypsor/telemail-middleware`. User runs it on their own server (`docker compose pull && up -d`); Worker calls it via `IMAP_BRIDGE_URL` + `IMAP_BRIDGE_SECRET`.

**Deployment topology**: single custom domain, Workers Routes split by path. `example.com/api/*` + `/oauth/*` → Worker; everything else → Pages (`telemail-web` project). Same origin, zero CORS.

**CI/CD** (`.github/workflows/ci.yml`): `dorny/paths-filter` decides which deploy jobs run. PRs get preview deployments (Worker version + Pages preview branch + docker build-only) and a sticky comment on the PR with URLs. `push to main` → production deploys. `workflow_dispatch` on main → forces all three deploys regardless of path filter. CF resource names: Worker `telemail`, Pages `telemail-web`, GHCR `ghcr.io/<owner>/telemail-middleware`. Required secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (GHCR uses `GITHUB_TOKEN`).

## Commands

Read the `scripts` blocks in:
- root [`package.json`](./package.json) — orchestration (`dev:worker`, `build:page`, `deploy:worker`, etc.) — root scripts forward to subpackages via `bun --filter <pkg> <script>`
- [`worker/package.json`](./worker/package.json) — wrangler / D1 scripts called by root
- [`page/package.json`](./page/package.json) — vite + tsr scripts called by root
- [`middleware/package.json`](./middleware/package.json) — bun runtime / `bun build --compile` scripts called by root

All commands run from repo root. Pre-commit must pass `bun check` (Biome) + `bun typecheck` (tsc on all 3 workspaces).

## Conventions

- **Layering**: `worker/handlers/` only do routing / auth / req-resp shaping; business logic lives in `worker/services/` or on a provider method.
- **Helpers**: file-private if used in ONE file, lift to nearest `utils/` if used in multiple. Same for dedup — extract HMAC signing / OAuth refresh / etc. instead of copy-pasting.
- **Shared types**: `worker/types.ts` (cross-cutting) or colocated `types.ts` (module-scoped, e.g. `providers/types.ts`). Never inline reusable types into handlers/services.
- **Error reporting**: `reportErrorToObservability()`, never `console.error`.
- **Email providers**: abstract class in `worker/providers/base.ts`, barrel in `worker/providers/index.ts` (`PROVIDERS`, `getEmailProvider`, `accountCanArchive`). Each provider (`gmail/`, `outlook/`, `imap/`) has its own `index.ts` + `utils.ts` + optional `types.ts`. **Never branch on `account.type` outside `providers/`** — per-provider differences live on the class (static metadata, instance methods, `static registerRoutes(app)` for webhooks).
- **IMAP message ids = RFC 822 Message-Id** (not per-folder UID). The bridge API takes `rfcMessageId` everywhere; UIDs are per-folder and can't address moved messages. Emails without Message-Id are dropped. Gmail/Outlook keep their native ids.
- **Archive**: `provider.archiveMessage(id)` + `accountCanArchive(account)`. Gmail needs the user to pick a label (`accounts.archive_folder`); without it `canArchive()` returns false.
- **State reconciliation**: all "remote → TG" syncs funnel through `reconcileMessageState` (`services/message-actions.ts`).
- **Star pin**: ⭐ email ↔ pinned TG msg via `syncStarPinState` in `services/message-actions.ts`. A `pin-cleanup` handler deletes "Bot pinned" service messages.
- **Disable/enable**: `accounts.disabled` pauses without deleting. Enforced in `services/bridge.ts::processEmailMessage` + filtered in push renewal / mail-list / `/sync` / `getImapAccounts`.
- **Cron**: single `* * * * *` trigger. Reminders dispatch every minute; `getUTCMinutes() === 0` gates hourly batch (LLM retry / IMAP bridge health); midnight renews pushes.
- **Email keyboard**: `buildEmailKeyboard` requires `tgMessageId`, so `deliverEmailToTelegram` sends naked → inserts `message_map` → builds keyboard → `setReplyMarkup`. Single code path for private + group.
- **Reminders**: only entry is the ⏰ button on email messages. Auth: `X-Telegram-Init-Data` + `users.approved`; group deep-link also checks `account.telegram_user_id === current user`. Cron sends with `reply_parameters` so the reminder threads under the original email.
- **Cross-package imports**: `page/` aliases `@worker/*` → `../worker/*`; `worker/` aliases `@page/*` → `../page/src/*`. Both directions carry **only pure-string constants / types** — never runtime code. Page → Worker pulls API path constants from `@worker/handlers/hono/routes` (zero-dep file). Worker → Page pulls Mini App URL paths from `@page/paths`.
- **Auth flows**: every page-side API call goes through `page/src/api/client.ts` (ky) which injects `X-Telegram-Init-Data` when in TG context. Worker `requireMiniAppAuth` verifies. Browser pages use a session cookie. Mail preview API also accepts an HMAC token.

## IMAP middleware gotchas (`middleware/`)

- **Redis is optional**: `REDIS_URL` set → `lastUid` per account survives restarts; otherwise in-memory only.
- **Periodic refresh** (`REFRESH_INTERVAL_MS`, 5 min): close + reconnect each client to prevent IDLE stalls (e.g. iCloud).
- **Reconnect is manual**: ImapFlow does not auto-reconnect. `close` event → `scheduleReconnect` → wait `RECONNECT_DELAY_MS` (3s) → fresh `ImapFlow`. Per-account timer guard prevents stacking.
- **Stale client guard**: event handlers capture the `ImapFlow` ref at registration and ignore events from replaced clients — preserve this when adding handlers.
- **Health endpoint stays unauthenticated**: returns only `{ ok, total, usable }` counts. Never expose email addresses.

ImapFlow specifics ([docs](https://imapflow.com/docs/guides/basic-usage/)):

- **Auto-IDLE**: enters IDLE after 15s, sends `DONE` before any other command. Don't manage IDLE manually.
- **No-IDLE fallback**: we pass `missingIdleCommand: "STATUS"` (default `NOOP` is unreliable, `SELECT` loops).
- **Never run IMAP commands inside a `fetch()` iterator** — deadlock.
- **Always pass `{ uid: true }`** to fetch/search. UIDs are stable across sessions; sequence numbers are not.
- **Lock discipline**: `getMailboxLock()` and release in `finally`.
- **Special-use flags**: `\Inbox`, `\Sent`, `\Drafts`, `\Trash`, `\Junk`, `\Archive` from `client.list()`, never hardcoded folder names.
