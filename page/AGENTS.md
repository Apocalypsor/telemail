# Page — Agent Guide

Cloudflare Pages SPA (Vite + React 19 + TanStack Router/Query + HeroUI + ky + zod). 单 entry serves browser web pages 和 Mini App routes (`/telegram-app/*`)。Cross-workspace rules in [root AGENTS.md](../AGENTS.md)。

## Conventions

- **Route folder pattern**: 每个路由用目录形式 `routes/<route>/index.tsx`，路由私有的代码放同级 `-components/` / `-utils/`。TSR `tanstackRouter({ autoCodeSplitting: true })` 跳过 `-` 前缀目录（不当成路由 segment）。动态参数也支持：`routes/mail/$id/index.tsx` ↔ `/mail/$id`。
- **`index.tsx` 应该薄**：state、data fetching (useQuery/useMutation)、navigate 行为、组合 `-components/` 里的展示组件。**不要**在 route 文件里定义大组件。
- **Helpers / 共享件**: 仅本路由用 → `routes/<route>/-components/` 或 `-utils/`；2+ 路由用 → `page/src/components/` / `hooks/` / `utils/`；样式常量进 `styles/`。新代码先 grep 一下别重新造。
- **Aliases**: `@/*` → `page/src/*`；`@worker/*` → `../worker/*`（**仅 import 类型 / 字符串常量**，无 runtime）。
- **Route validation**: 用 zod search schema (`zodValidator(searchSchema)`)，可选参数用 `fallback(...)` 兜底，不要让脏 URL 把整页崩在 `errorComponent`。
- **TG Mini App vs Web**:
  - Mini App (`/telegram-app/*`)：`getTelegram()` 拿 `window.Telegram.WebApp`。底部按钮 / BackButton / SettingsButton / Haptic / Popup 都走 TG 原生 UI。
  - Web (其它路由)：session cookie 鉴权，UI 走真 DOM 按钮。
  - 两边共享 API（如 `/api/mail/:id`）→ 共用同一个 schema。
- **类型来自 `@/api/schemas`**（zod-derived）；不要重新定义跟 worker shape 重复的 type。
- **Hook 顺序**：所有 `useXxx` 必须在条件 `return` 之前，遵守 rules-of-hooks。
- **改 route 文件结构后 `bun --filter telemail-page typecheck`** 会跑 `tsr generate` 重新生成 `routeTree.gen.ts`。
