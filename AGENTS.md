# Telemail — Agent Guide

> **Commit only when explicitly asked.** Don't auto-commit after finishing a task — wait for the user to say so.
> **Before commit**: `bun check` (Biome) + `bun typecheck` (tsc) from repo root. Don't use `biome-ignore`. Update `README.md` / `docs/*` when you change behavior they describe.

User-facing docs: `README.md`, `docs/DEVELOPMENT.md`, `docs/DEPLOYMENT.md`, `docs/ENVIRONMENT.md`.

Per-workspace guides: [`worker/AGENTS.md`](./worker/AGENTS.md) · [`page/AGENTS.md`](./page/AGENTS.md) · [`middleware/AGENTS.md`](./middleware/AGENTS.md).

Cloudflare API knowledge may be stale — fetch <https://developers.cloudflare.com/workers/> before any Workers/KV/D1/Queues task.

## Workspaces (bun monorepo)

- **`worker/`** Cloudflare Worker (Elysia + grammY) — bot webhook, queue, cron, providers, D1. Owns `wrangler.example.jsonc` + `migrations/`. CI generates real `wrangler.jsonc` via `envsubst` from `CF_D1_DATABASE_ID` + `CF_KV_NAMESPACE_ID`.
- **`page/`** Cloudflare Pages SPA (Vite + React + TanStack Router/Query + HeroUI + Eden treaty) — single bundle serves both web pages and Mini App routes (`/telegram-app/*`).
- **`middleware/`** IMAP bridge (Bun + Elysia + ImapFlow) — **not on Cloudflare**. Built to single binary, packaged as multi-arch docker image. User runs it on their server; Worker calls it via `IMAP_BRIDGE_URL` + `IMAP_BRIDGE_SECRET`.

Single custom domain. `*.com/api/*` + `/oauth/*` → Worker; everything else → Pages. Same origin, zero CORS.

CI/CD via `.github/workflows/ci.yml` — `dorny/paths-filter` decides which deploy jobs run. Required secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

All scripts run from repo root. Read root + per-workspace `package.json` for the actual command list.

## Cross-cutting conventions

- **Helpers**: file-private if used in ONE file; lift to nearest `utils/` (or `components/` / `hooks/` on page side) when used in multiple. Same applies to dedup — extract instead of copy-pasting.
- **No barrel imports**: don't write `index.ts` files that just `export ... from "./foo"`. Consumers `import { x } from "@worker/.../<file>"` directly. Saves one redirection when reading code, removes a class of "where does this actually live" confusion. Module / plugin `index.ts` that contain real logic (Elysia controller, Worker entry) are fine — only re-export-only barrels are banned.
- **Shared types**: `worker/types.ts` for cross-cutting; module-scoped `types.ts` (e.g. `providers/types.ts`) otherwise. Never inline reusable types into handlers / services / route components.
- **Error reporting** (worker): `reportErrorToObservability(env, "tag", err)`, never `console.error`. Page side: surface via `extractErrorMessage()`, no silent swallowing.
- **Cross-package imports**: only three TS path aliases exist repo-wide — `@page/*` `@worker/*` `@middleware/*`, declared in `tsconfig.base.json`. Page imports `@worker/*` are **type-only** (no runtime — keeps the page bundle slim). Worker imports `@page/paths` (Mini App URL constants) and `@middleware/index` (Eden `App` type for the IMAP bridge client).
- **Auth + API contract**: page calls worker through Eden treaty (`page/src/api/client.ts` exports `treaty<App>(...)` where `App` comes from `import type { App } from "@worker/api"`). Eden auto-injects `X-Telegram-Init-Data` in TG context; worker plugin `authMiniApp` verifies. Web pages use a session cookie (`authSession`). Mail preview GET also accepts an HMAC token. Worker calls middleware the same way (`treaty<App>` against `@middleware/index`, with `throwHttpError: true`).

## Elysia layout

Applies everywhere Elysia is used: worker `worker/src/api/{modules,plugins}/` and middleware `middleware/src/{modules,plugins}/`.

[Elysia "Service"](https://elysiajs.com/essential/best-practice.html#service) means two different patterns here:

- **Non-request-dependent** - does not read cookies, headers, or Elysia `Context`; dependencies are passed explicitly, such as `env`. **Always use `abstract class XxxService { static foo(env, ...){} }`** and place it in `modules/<name>/service.ts`. This conflicts with Biome's `noStaticOnlyClass`, so that rule is disabled in the root `biome.json`.
- **Request-dependent** - reads cookies, headers, or Elysia `Context` for auth, env injection, and similar concerns. This should be an Elysia instance (`new Elysia(...).macro(...)` / `.derive(...)`) under `plugins/<name>/`. The plugin itself is the service; **do not add a separate `service.ts` inside a plugin directory**.

### Module (`modules/<name>/`) - only these filenames are allowed

```
index.ts        # Elysia controller - routes + handlers
model.ts        # `t.Object(...)` body / query / params / response schema
types.ts        # unions / interfaces that do not fit in schema
service.ts      # business orchestration across DB / provider / KV / HMAC
utils.ts        # pure helpers - single-purpose, no business context dependency
components.ts   # SSR HTML (only oauth uses this)
```

How to decide service vs utils: needs `env` plus multiple DB / provider calls -> service; formatter / parser / one-line lookup -> util.

### Plugin (`plugins/<name>/`)

Either a single `<name>.ts` file or a directory. Directory shape:

```
index.ts        # Elysia instance + implementation
types.ts
utils.ts        # private helpers
```

### When `utils.ts` grows too large -> promote it to a `utils/` directory

```
utils/
└── <purpose>.ts    # name by purpose (`format.ts` `deliver.ts` `retry.ts`)
```

**No barrel `index.ts` files**. The project bans barrel re-exports across the board: they save one import segment but make definition lookup harder. Import directly from `@worker/.../utils/<purpose>`. Child files may be named by purpose, but **do not use** generic names like `service.ts`, `lib.ts`, or `helpers.ts`; `service.ts` is only allowed at the module root.
