import type { Child } from "hono/jsx";

/** Mini App 各页面共享的基础样式：TG 主题 CSS 变量 + 全局 reset。
 *  `MiniAppShell` 默认注入；具体页面把自己的 `extraCss` 传进去拼在后面。 */
const MINIAPP_BASE_CSS = `
:root {
  color-scheme: light dark;
  --bg: var(--tg-theme-bg-color, #0f172a);
  --surface: var(--tg-theme-secondary-bg-color, #1e293b);
  --text: var(--tg-theme-text-color, #e2e8f0);
  --hint: var(--tg-theme-hint-color, #94a3b8);
  --link: var(--tg-theme-link-color, #60a5fa);
  --button: var(--tg-theme-button-color, #3b82f6);
  --button-text: var(--tg-theme-button-text-color, #ffffff);
  --separator: var(--tg-theme-section-separator-color, rgba(127,127,127,.18));
  --danger: #ef4444;
  --border: rgba(127,127,127,.18);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 15px;
  line-height: 1.5;
  -webkit-tap-highlight-color: transparent;
}
`.trim();

/**
 * Mini App 各页面共用的 HTML 外壳：charset / viewport / favicon /
 * `telegram-web-app.js` / `MINIAPP_BASE_CSS`。
 *
 * 用法：
 * ```
 * <MiniAppShell title="..." extraCss={PAGE_CSS}>
 *   <body 内的内容 />
 *   <script ... />
 * </MiniAppShell>
 * ```
 */
export function MiniAppShell({
  title,
  extraCss,
  children,
}: {
  title: string;
  /** 当前页面专属 CSS，会拼在 MINIAPP_BASE_CSS 后面 */
  extraCss?: string;
  children: Child;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <title>{title}</title>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <script src="https://telegram.org/js/telegram-web-app.js" />
        <style
          dangerouslySetInnerHTML={{
            __html: extraCss
              ? `${MINIAPP_BASE_CSS}\n${extraCss}`
              : MINIAPP_BASE_CSS,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
