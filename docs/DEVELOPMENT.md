# 本地开发

## 目录结构

- **`worker/`** —— Cloudflare Worker（Hono）。Bot webhook、queue consumer、cron、email providers、D1 / KV 访问、`/api/*` + `/oauth/*` 端点
- **`page/`** —— Cloudflare Pages 前端（Vite + React 19 + TanStack Router + TanStack Query + HeroUI）。pnpm workspace 子包 `telemail-page`。web 页面（`/`、`/mail/:id`、`/preview`、`/junk-check`、`/login`）和 Mini App 路由（`/telegram-app/*`）共用同一个 `index.html` + `main.tsx`
- **`scripts/`** —— 构建辅助（目前只有 Tailwind CSS 打包给 Worker 的 OAuth SSR 页用）
- **`migrations/`** —— D1 schema migrations

## 命令

```sh
# 后端（Worker）
pnpm dev        # build:css + wrangler dev（本地 127.0.0.1:8787）
pnpm deploy     # build:css + wrangler deploy
pnpm build:css  # 单独生成 Tailwind CSS（输出到 worker/assets/tailwind.ts）
pnpm cf-typegen # 根据 wrangler.jsonc 重新生成 worker-configuration.d.ts
pnpm migrate    # 应用 D1 migrations 到远端

# 前端（Pages，page/ 子包）
pnpm dev:page   # Vite dev server (127.0.0.1:5173)，/api/* 自动代理到本地 Worker
pnpm build:page # 构建到 page/dist

# 共用
pnpm check      # Biome lint + 格式检查（pre-commit 自动触发，覆盖全仓库）
pnpm typecheck  # Worker tsc + Page tsc
```

## 前端开发流程

1. 一个终端跑 `pnpm dev`（Worker 起在 :8787）
2. 另一个终端跑 `pnpm dev:page`（Vite 起在 :5173）
3. 浏览器开 <http://localhost:5173/telegram-app/> 测 Mini App 页，或 `/mail/:id` / `/preview` 等 web 页，`/api/*` 自动代理到本地 Worker
4. TG WebApp 相关功能（`initData`、`BackButton`、`HapticFeedback`、`requestFullscreen` 等）在本地浏览器里 `TelegramProvider` 会检测到 `initData` 为空后 no-op；要测这些得在 Telegram 客户端里连真实 Bot

## 提交前必跑

```sh
pnpm check
pnpm typecheck
```

修所有报错。不要用 `biome-ignore` 绕过 lint（少数明确无解的情况可以，写清楚为什么）。

## 国际化 (i18n)

用户可见字符串通过 [i18next](https://www.i18next.com/) 管理（`import { t } from "@i18n"`），翻译文件按模块拆分在 `worker/i18n/locales/zh/` 下。当前仅中文。

## 类型共享

`page/tsconfig.json` + `page/vite.config.ts` 的 `@worker/*` 别名指向 `../worker/*`。Page 只做 `import type` 引用 Worker 的类型 / 路径常量（`page/src/api/routes.ts` re-export 自 `worker/handlers/hono/routes.ts`），不把 Worker 运行时 deps 拖进前端 bundle。

## 测试

```sh
pnpm exec vitest
```

测试配置在 `vitest.config.mts`，用 `@cloudflare/vitest-pool-workers` 在本地模拟 Worker 环境。
