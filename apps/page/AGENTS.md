# Page — Agent Guide

Cloudflare Pages SPA. Cross-workspace rules in [root AGENTS.md](../../AGENTS.md).

Before changing page behavior, follow root "Explore first"; start from the current route tree, router config, API client, and app providers. Do not rely on this file for dependency versions, route inventory, or Mini App entry points.

## Conventions

- **Route folder pattern**: each route is a directory `routes/<route>/index.tsx`; route-private code lives in sibling `-components/` / `-utils/`. TSR's `tanstackRouter({ autoCodeSplitting: true })` skips `-`-prefixed dirs (not treated as route segments). Dynamic params work too: `routes/mail/$id/index.tsx` ↔ `/mail/$id`.
- **Keep `index.tsx` thin**: state, data fetching (useQuery/useMutation), navigate behavior, composing presentational components from `-components/`. **Don't** define large components inside the route file.
- **Helpers / shared bits**: route-only → `routes/<route>/-components/` or `-utils/`; used by 2+ routes → `apps/page/src/components/` / `hooks/` / `utils/`; style constants go in `styles/`. Grep before writing new code so you don't recreate something.
- **Route file ordering**: keep `export const Route = createFileRoute(...)` at the bottom of route files. Route-local search schemas may sit immediately above it. Put `interface` / reusable type declarations near the top of the file after imports, or move them into a route-private `-utils/types.ts`; don't leave types below components. Pure helpers, unwrap functions, query-key builders, and action config belong in `-utils/`; route files should only keep hook-local callbacks and component composition.
- **Imports / aliases**: use the root alias rules; page-side backend package imports must stay type-only unless current bundler config explicitly supports otherwise.
- **API client = Eden treaty**: start from the current page API client. Routes/methods/body/query/response are derived from the worker's Elysia routes — no hand-written URL constants, no duplicate schemas. Inspect current treaty behavior before changing error handling or auth injection.
- **Route validation**: declare a `t.Object({...})` schema (use `import { Type as t } from "@sinclair/typebox"` — same API as Elysia's `t`, but no Elysia runtime in the page bundle) and pass it through `validateSearch(Search)` from `@page/api/utils`. Pipeline: `Value.Clean` (drop unknown keys) → `Value.Convert` (coerce `?id=123` to `number`, `?cache=true` to `boolean`) → per-field `Value.Check` (drop dirty optional fields — restores the old `fallback(...)` tolerance) → `Value.Parse` (throw if a required field is still missing/wrong → TanStack `errorComponent`). `t.Optional(...)` makes a field optional and absent keys won't appear in the parsed object, so `navigate({ search: { ... } })` doesn't have to fill them.
- **Cross-package types**: use type-only imports from the current backend model files. Don't redefine types that mirror worker shapes.
- **TG Mini App vs Web**: inspect the current route tree, Telegram provider, TG helpers, and auth flow before changing a screen. **Don't** read `window.Telegram` directly — call SDK functions or existing helpers. Keep Mini App-specific button/back behavior in the established hooks rather than route-local DOM hacks.
- **Error surface**: reuse the current page API error helpers. Don't add route-local parsing for shared API error shapes.
- **Hook order**: every `useXxx` must run before any conditional `return` — rules-of-hooks.
- **After changing route file structure**, run the page typecheck script so generated route files stay current.
