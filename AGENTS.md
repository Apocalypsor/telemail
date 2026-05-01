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

[Elysia "Service"](https://elysiajs.com/essential/best-practice.html#service) 是两种形态，按是否依赖 HTTP context 分：

1. **Non-request-dependent service** —— 不读 cookie / header / Context，靠显式参数（如 `env`）拿依赖。**严格用 `abstract class XxxService { static foo(env, ...){} }`**，避免实例分配。住在 `modules/<name>/service.ts`。Biome 的 `noStaticOnlyClass` 跟这条冲突，已在根 `biome.json` 全局关掉。
2. **Request-dependent service** —— 需要读 cookie / header / Elysia Context 才能完成职责（鉴权、session 解析、env 注入等）。形态是 Elysia instance（`new Elysia(...).macro(...)` 或 `.derive(...)`），住在 `plugins/<name>/`。Plugin 本身就是 Elysia 推荐的这种 service 形态，**不要在 plugin 目录里再开 `service.ts`**。

每个 module 在 `modules/<name>/`，**严格只允许这套文件名**：

```
modules/<name>/
├── index.ts        # Elysia controller —— 路由声明、handler 主体
├── model.ts        # `t.Object(...)` body / query / params / response schema
├── types.ts        # 仅 TS 类型声明（schema 装不下的 union / interface）
├── service.ts      # 业务编排（DB / provider / KV / HMAC 跨子系统的 use-case，non-request-dependent）
├── utils.ts        # 纯 helper —— 不含编排，仅供本 module 用
└── components.ts   # SSR HTML 渲染（仅 oauth 等少数模块需要）
```

`service.ts` vs `utils.ts`：
- **service** 装"业务逻辑用例"：跨 DB / provider / KV / HMAC 的编排、auth/ownership 校验、enrich 流程。形态见上文第 1 类。
- **utils** 只装真正的纯 helper：单一职责、不依赖业务上下文（formatter / parser / 一行 lookup）。如果一个函数要 `env` + 两三个 db 调用 + provider 调用 → 它是 service，不是 util。

每个 plugin 在 `plugins/`，要么是单文件 `<name>.ts`，要么是 `<name>/` 目录。
目录形态**严格只允许**：

```
plugins/<name>/
├── index.ts        # 导出 Elysia 实例（plugin 即 request-dependent service，业务体一并写在这里）
├── types.ts        # 类型
└── utils.ts        # 私有 helper
```

`.macro` 用于路由 opt-in 的能力（如 `isSignIn: true`），`.derive` 用于无条件挂上 context（如 cf plugin 注入 `env` / `waitUntil`，auth-miniapp 注入 `userId` / `isAdmin`）。Elysia 推荐 `.decorate` 只用于 request-dependent property（避免把代码绑死到 Elysia），但作为 ergonomic 取舍，singleton-like 的 `env` 也可以 decorate（见 `api/plugins/cf.ts`）。

**不允许**别的命名（不要 `helpers.ts` `lib.ts` `format.ts` `deliver.ts` 之类）。

**`utils.ts` 单文件写不下** → 升级为 `utils/` 目录，**目录里同样严格遵守 `index / utils / types`**：

```
modules/<name>/utils/
├── index.ts        # barrel：re-export 给外部用的
├── <purpose>.ts    # 按用途拆分（如 `format.ts` `deliver.ts` `retry.ts`）
└── ...
```

子文件可以按用途自由命名（因为是 module 内部私有），但**同样不能再有 `service.ts` `lib.ts` 这种泛词**（service 应当出现在 module 根，不是 utils 子目录）。子目录也按同样规则递归。

`worker/src/api/modules/oauth/` 是当前唯一带 `components.ts` 的例子；其它 module 不需要就别造。
