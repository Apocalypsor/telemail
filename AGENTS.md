# Telemail — Agent Guide

> **Commit only when explicitly asked.** Don't auto-commit after finishing a task — wait for the user to say so.
> **Before commit**: `bun check` (Biome) + `bun typecheck` (tsc) from repo root. Don't use `biome-ignore`. Update `README.md` / `docs/*` when you change behavior they describe.
> **Commit message convention**: use Conventional Commits (`<type>(optional-scope): <summary>`). Feature work must start with `feat:` (for example, `feat: add account sync`); use `fix:`, `docs:`, `chore:`, etc. only when that type accurately describes the change.

User-facing docs: `README.md`, `docs/DEVELOPMENT.md`, `docs/DEPLOYMENT.md`, `docs/ENVIRONMENT.md`.

Per-workspace guides: [`apps/worker/AGENTS.md`](./apps/worker/AGENTS.md) · [`apps/page/AGENTS.md`](./apps/page/AGENTS.md).

## Explore first

Treat AGENTS.md as stable guardrails, not a live architecture inventory. Before changing a workspace, inspect the current source, package scripts, runtime config, deploy config, migrations if relevant, and the user-facing docs listed above. Use `rg` to find existing patterns and call sites before adding new ones.

If this guide conflicts with the checked-in code or docs, trust the checked-in code after verifying the behavior, then update the guide only for durable conventions. Do not encode deployment topology, secret names, route inventories, cadence values, or one-off file locations here when a future agent can discover them directly from source.

Cloudflare API knowledge may be stale — fetch <https://developers.cloudflare.com/workers/> before any Workers/KV/D1/Queues task.

## Workspaces (bun monorepo)

- **`apps/worker/`** Worker-side backend runtime.
- **`apps/page/`** Browser / Mini App frontend.

Routing, domains, deploy conditions, runtime topology, and required secrets belong to source/config/docs. Verify those files instead of assuming the topology from this guide.

All scripts run from repo root. Read root + per-workspace `package.json` for the actual command list.

## Cross-cutting conventions

- **Helpers**: file-private if used in ONE file; place those file-private helpers at the bottom of the file, after the main exported component/function, when execution order allows. Keep setup constants and framework-required declarations in their natural positions. Lift to nearest `utils/` (or `components/` / `hooks/` on page side) when used in multiple. Same applies to dedup — extract instead of copy-pasting.
- **No barrel imports**: don't write `index.ts` files that just `export ... from "./foo"`. Consumers `import { x } from "@worker/.../<file>"` directly. Saves one redirection when reading code, removes a class of "where does this actually live" confusion. Module / plugin `index.ts` that contain real logic (Elysia controller, Worker entry) are fine — only re-export-only barrels are banned.
- **Function style**: use arrow function expressions for standalone functions (`const foo = (...) => {}` / `export const foo = (...) => {}`), including helpers, React components, hooks, route-local handlers, and nested functions. Keep class methods, object literal methods, Elysia route chaining, and type / interface method signatures in their idiomatic syntax.
- **Shared types**: `apps/worker/src/types.ts` for cross-cutting; module-scoped `types.ts` (e.g. `providers/types.ts`) otherwise. Never inline reusable types into handlers / services / route components.
- **Type placement**: in regular `.ts` / `.tsx` implementation files, keep module-level `interface` and `type` declarations immediately after imports, before runtime constants/functions/classes/components/hooks. Schema-derived aliases such as `UnwrapSchema<typeof Foo>` or `typeof app` may stay next to the value they derive from. Do not park local interfaces at the bottom of a file.
- **Error reporting** (worker): `reportErrorToObservability(env, "tag", err)`, never `console.error`. Page side: surface via `extractErrorMessage()`, no silent swallowing.
- **Cross-package imports**: only the TS path aliases declared in `tsconfig.base.json` are allowed. Page-side imports from backend packages must stay type-only unless the current bundler config explicitly supports the runtime import. Do not add short aliases that hide package ownership.
- **Auth + API contract**: do not hand-write HTTP contracts. Start from the current clients, Elysia apps, and auth plugins in source, then let exported types drive route/method/body/query/response shapes. Verify current headers, cookies, tokens, and transports before changing auth or provider routes.

## Elysia layout

Applies everywhere Elysia is used. Start from the current module / plugin directories in the workspace you are editing.

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
