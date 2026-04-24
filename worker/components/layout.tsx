import type { Child } from "hono/jsx";

/**
 * Worker SSR 的极简外壳 —— OAuth 流程几个过渡页 (`/oauth/...`) 在用。
 *
 * 之前跟 Page 走一样的 Tailwind，build 时 `scripts/build-css.mjs` 把整套
 * Tailwind JIT 打包成 31KB 字符串 embed 进来。就几个页面，完全不值。现在
 * 手写一份 semantic CSS 直接 inline 到 `<style>`，配色和 Page 一致
 * （zinc-950 背景 + emerald accent）。
 */
const INLINE_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    background: #09090b; /* zinc-950 */
    color: #f4f4f5; /* zinc-100 */
    display: flex;
    justify-content: center;
    padding: 1.5rem;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-tap-highlight-color: transparent;
  }
  .card {
    width: 100%;
    max-width: 48rem;
    margin-block: auto;
    background: #18181b; /* zinc-900 */
    border: 1px solid #27272a; /* zinc-800 */
    border-radius: 1rem;
    padding: 1.5rem;
  }
  .card > * + * { margin-top: 0.75rem; }
  h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 0.75rem 0;
    letter-spacing: -0.025em;
  }
  .title-ok { color: #6ee7b7; }  /* emerald-300 */
  .title-warn { color: #fcd34d; } /* amber-300 */
  .title-err { color: #f87171; }  /* red-400 */
  p { margin: 0; font-size: 0.875rem; line-height: 1.625; color: #a1a1aa; } /* zinc-400 */
  strong { color: #f4f4f5; font-weight: 600; }
  .text-warn { color: #fcd34d; }
  code {
    padding: 0.125rem 0.375rem;
    background: #09090b;
    border: 1px solid #27272a;
    border-radius: 0.25rem;
    color: #6ee7b7; /* emerald-300 */
    font-size: 0.75rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    word-break: break-all;
  }
  ol.steps {
    margin: 0.75rem 0 0 1.25rem;
    padding: 0;
    list-style: decimal;
  }
  ol.steps > li { margin-block: 0.5rem; }
  ol.steps > li:first-child { margin-top: 0; }
  .btn {
    display: inline-block;
    margin-top: 1.25rem;
    padding: 0.75rem 1rem;
    background: #10b981; /* emerald-500 */
    color: #022c22; /* emerald-950 */
    font-weight: 600;
    font-size: 0.875rem;
    text-decoration: none;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background-color 0.15s;
  }
  .btn:hover { background: #34d399; } /* emerald-400 */
  .token-input {
    margin-top: 1rem;
    width: 100%;
    min-height: 100px;
    padding: 0.75rem;
    background: #09090b;
    border: 1px solid #27272a;
    border-radius: 0.5rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.75rem;
    color: #6ee7b7;
    resize: vertical;
  }
  pre.error {
    margin: 0;
    padding: 0.75rem;
    background: #09090b;
    border: 1px solid #27272a;
    border-radius: 0.5rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.75rem;
    color: #f87171; /* red-400 */
    white-space: pre-wrap;
    word-break: break-word;
    overflow: auto;
  }
`;

export function Layout({
  title,
  children,
}: {
  title: string;
  children: Child;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <style dangerouslySetInnerHTML={{ __html: INLINE_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

export function Card({
  children,
  class: className,
}: {
  children: Child;
  class?: string;
}) {
  return (
    <main class={`card${className ? ` ${className}` : ""}`}>{children}</main>
  );
}
