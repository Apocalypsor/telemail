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
- **Shared types**: `worker/types.ts` for cross-cutting; module-scoped `types.ts` (e.g. `providers/types.ts`) otherwise. Never inline reusable types into handlers / services / route components.
- **Error reporting** (worker): `reportErrorToObservability(env, "tag", err)`, never `console.error`. Page side: surface via `extractErrorMessage()`, no silent swallowing.
- **Cross-package imports**: only three TS path aliases exist repo-wide — `@page/*` `@worker/*` `@middleware/*`, declared in `tsconfig.base.json`. Page imports `@worker/*` are **type-only** (no runtime — keeps the page bundle slim). Worker imports `@page/paths` (Mini App URL constants) and `@middleware/index` (Eden `App` type for the IMAP bridge client).
- **Auth + API contract**: page calls worker through Eden treaty (`page/src/api/client.ts` exports `treaty<App>(...)` where `App` comes from `import type { App } from "@worker/api"`). Eden auto-injects `X-Telegram-Init-Data` in TG context; worker plugin `authMiniApp` verifies. Web pages use a session cookie (`authSession`). Mail preview GET also accepts an HMAC token. Worker calls middleware the same way (`treaty<App>` against `@middleware/index`, with `throwHttpError: true`).

## Elysia layout

适用于所有用 Elysia 的位置：worker `worker/src/api/{modules,plugins}/`、middleware `middleware/src/{modules,plugins}/`。

[Elysia "Service"](https://elysiajs.com/essential/best-practice.html#service) 分两种：

- **Non-request-dependent** —— 不读 cookie / header / Context，靠显式参数（如 `env`）拿依赖。**严格用 `abstract class XxxService { static foo(env, ...){} }`**，住 `modules/<name>/service.ts`。Biome 的 `noStaticOnlyClass` 跟这条冲突，已在根 `biome.json` 关掉。
- **Request-dependent** —— 读 cookie / header / Elysia Context（鉴权、env 注入等）。形态是 Elysia instance（`new Elysia(...).macro(...)` / `.derive(...)`），住 `plugins/<name>/`。Plugin 自身就是这种 service，**不要在 plugin 目录里再开 `service.ts`**。

### Module (`modules/<name>/`) — 严格只允许这套文件名

```
index.ts        # Elysia controller —— 路由 + handler
model.ts        # `t.Object(...)` body / query / params / response schema
types.ts        # schema 装不下的 union / interface
service.ts      # 业务编排（DB / provider / KV / HMAC 跨子系统）
utils.ts        # 纯 helper —— 单一职责、不依赖业务上下文
components.ts   # SSR HTML（仅 oauth 在用）
```

判定 service vs utils：要 `env` + 多个 db / provider 调用 → service；formatter / parser / 一行 lookup → util。

### Plugin (`plugins/<name>/`)

单文件 `<name>.ts` 或目录。目录形态：

```
index.ts        # Elysia 实例 + 业务体
types.ts
utils.ts        # 私有 helper
```

### `utils.ts` 装不下 → 升级为 `utils/` 目录

```
utils/
├── index.ts        # barrel re-export
└── <purpose>.ts    # 按用途命名（`format.ts` `deliver.ts` `retry.ts`）
```

子文件可按用途命名，但**任何 utils 子目录里都不允许** `service.ts` `lib.ts` `helpers.ts` 这种泛词 —— service 只能在 module 根。
