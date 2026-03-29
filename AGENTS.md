# Cloudflare Workers

> **MANDATORY: Code Quality & Documentation**
>
> Before committing ANY changes, you MUST:
>
> 1. Run `pnpm check` — Biome lint + format check. Fix ALL errors and warnings. Do NOT use `biome-ignore` — fix the code instead.
> 2. Run `pnpm typecheck` — TypeScript type checking. Fix ALL errors.
> 3. Update **AGENTS.md** and **README.md** if your changes affect commands, conventions, architecture, or features. Do not forget README.md.
>
> These checks also run automatically on pre-commit hook (husky + lint-staged).

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

For all limits and quotas, retrieve from the product's `/platform/limits/` page. eg. `/workers/platform/limits`

## Commands

| Command           | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `pnpm dev`        | Build CSS + local development                  |
| `pnpm deploy`     | Build CSS + deploy to Cloudflare               |
| `pnpm build:css`  | Generate Tailwind CSS (src/assets/tailwind.ts) |
| `pnpm check`      | Lint + format check (Biome)                    |
| `pnpm typecheck`  | TypeScript type checking (tsc --noEmit)        |
| `pnpm cf-typegen` | Generate TypeScript types from wrangler.jsonc  |

**IMPORTANT**: Biome check runs automatically on pre-commit hook (husky + lint-staged). You can also run `pnpm check --fix` or `pnpm exec biome check --write <file>` manually.
Run `pnpm cf-typegen` after changing bindings in wrangler.jsonc.
Run `pnpm build:css` after changing Tailwind classes in components (auto-runs with dev/deploy).

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from `/workers/platform/limits/`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`

## Helper Functions

Helper functions must live in the module that owns the domain logic, not in the handler that calls them. Handlers (`src/handlers/`) should only contain routing and request/response orchestration. For example, a function that formats a PostalMime `Address` belongs in `src/services/email/mail-content.ts`, not in the handler that happens to use it. When writing a helper, ask: "which module owns this concept?" and place it there.

## Theme

All color values are centralized in `src/assets/theme.ts` (slate/blue palette). Used by the mail preview FAB and any inline CSS injected outside of Tailwind context.

## Error Reporting

Use `reportErrorToObservability()` from `src/utils/observability.ts` instead of `console.error` / `console.warn` for all error handling. The observability service forwards errors to the monitoring system; `console.error` output may not be visible in production. The only exceptions are inside `observability.ts` itself and in utility functions that don't have access to `env` (e.g., `telegram.ts`).

## Documentation Maintenance

After making significant changes (new features, architectural refactors, route changes, dependency changes), update:

1. **AGENTS.md** — Keep commands, conventions, and project-specific notes current.
2. **README.md** — Update project description, setup instructions, route documentation, and tech stack as needed. **Do not forget to update README.md** — it is the user-facing documentation and must stay in sync with AGENTS.md.
