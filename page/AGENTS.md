# Page — Agent Guide

Cloudflare Pages SPA (Vite + React 19 + TanStack Router/Query + HeroUI + Eden treaty). A single entry serves both browser web pages and Mini App routes (`/telegram-app/*`). Cross-workspace rules in [root AGENTS.md](../AGENTS.md).

## Conventions

- **Route folder pattern**: each route is a directory `routes/<route>/index.tsx`; route-private code lives in sibling `-components/` / `-utils/`. TSR's `tanstackRouter({ autoCodeSplitting: true })` skips `-`-prefixed dirs (not treated as route segments). Dynamic params work too: `routes/mail/$id/index.tsx` ↔ `/mail/$id`.
- **Keep `index.tsx` thin**: state, data fetching (useQuery/useMutation), navigate behavior, composing presentational components from `-components/`. **Don't** define large components inside the route file.
- **Helpers / shared bits**: route-only → `routes/<route>/-components/` or `-utils/`; used by 2+ routes → `page/src/components/` / `hooks/` / `utils/`; style constants go in `styles/`. Grep before writing new code so you don't recreate something.
- **Aliases**: only three TS path aliases exist repo-wide — `@page/*` `@worker/*` `@middleware/*`, declared in root `tsconfig.base.json` and inherited via `extends`. Page-internal imports use `@page/components/...` `@page/hooks/...` `@page/utils/...` etc. Cross-package access goes through `@worker/*` (type-only — keeps page bundle slim) and `@middleware/*` (rare in page, but available). No `@components/*` `@api/*` etc. shortcuts —— the package prefix is mandatory so each alias resolves to exactly one place across the monorepo.
- **API client = Eden treaty**: `page/src/api/client.ts` exports `api = treaty<App>(...)`. `App` comes from `import type { App } from "@worker/api"`; routes/methods/body/query/response are all derived from the worker's Elysia routes — no hand-written URL constants, no zod schemas. Shape: `await api.api.mail({ id }).get({ query: { ... } })` returns `{ data, error }` (status ≥ 300 → `data: null`, `error.value` is the response body).
- **Route validation**: declare a `t.Object({...})` schema and pass it through `validateSearch(Search)` from `@page/api/search`. The helper does `Value.Clean → Value.Convert → Value.Parse` (drops unknown keys, coerces `?id=123` to `number`, throws on missing required / type-mismatch). `t.Optional(...)` makes a field optional — missing key omitted from the parsed object so navigate calls don't need to set it. Same TypeBox runtime as worker, no extra schema lib.
- **Cross-package types**: use `import type { Foo } from "@worker/api/modules/<feature>/model"` to share TypeBox-derived types. Worker side declares `export type Foo = UnwrapSchema<typeof Foo>` (the Elysia best-practice). Don't redefine types that mirror worker shapes.
- **TG Mini App vs Web**:
  - Mini App (`/telegram-app/*`): uses `@telegram-apps/sdk-react`. Init / mount / theme colors / fullscreen happen in `providers/telegram.tsx`. Helpers in `@page/utils/tg` (`notifyHaptic`, `confirmPopup`, `alertPopup`, `openExternalLink`, `openTgLink`, `closeMiniAppSafe`); buttons go through hooks in `@page/hooks/use-back-button` and `@page/hooks/use-bottom-button`. **Don't** read `window.Telegram` directly — call SDK functions or use the helpers.
  - Web (other routes): session cookie auth, real DOM buttons.
- **Error surface**: `extractErrorMessage(err)` in `@page/api/utils` understands Eden errors (`{ status, value }`) and plain `Error`s. `redirectToLoginOnUnauthorized(err)` does the 401 → `/login?return_to=...` jump for session pages.
- **Hook order**: every `useXxx` must run before any conditional `return` — rules-of-hooks.
- **After changing route file structure**, `bun --filter telemail-page typecheck` runs `tsr generate` to refresh `routeTree.gen.ts`.
