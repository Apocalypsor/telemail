# Cloudflare Workers

> Before committing, run `pnpm check` (Biome) and `pnpm typecheck` (tsc). Fix ALL errors. Do NOT use `biome-ignore`. Update AGENTS.md and README.md if needed.

Your knowledge of Cloudflare Workers APIs may be outdated. Retrieve current docs before any Workers/KV/D1/Queues task: <https://developers.cloudflare.com/workers/>

## Commands

| Command           | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `pnpm dev`        | Build CSS + local development                 |
| `pnpm deploy`     | Build CSS + deploy to Cloudflare              |
| `pnpm check`      | Lint + format check (Biome)                   |
| `pnpm typecheck`  | TypeScript type checking (tsc --noEmit)       |
| `pnpm cf-typegen` | Generate TypeScript types from wrangler.jsonc |
| `pnpm build:css`  | Generate Tailwind CSS (src/assets/tailwind.ts)|

Run `pnpm cf-typegen` after changing bindings in wrangler.jsonc.

## Conventions

- **Handlers** (`src/handlers/`) only do routing and auth. Business logic belongs in `src/services/`.
- **Error reporting**: Use `reportErrorToObservability()` instead of `console.error`.
- **Email providers**: Abstract class pattern in `src/services/email/`. New operations: add abstract method to `provider.ts`, implement in all three providers (`gmail/`, `outlook/`, `imap/`). Low-level helpers go in each provider's `utils.ts`.
