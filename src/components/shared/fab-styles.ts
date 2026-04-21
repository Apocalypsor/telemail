import { theme } from "@assets/theme";

/** MailFab 的样式（web + miniapp 共用）。
 *  主题颜色作为 CSS 变量声明在 :root，把所有动态值集中在文件顶部。 */
export const FAB_CSS = `
:root {
  --fab-primary: ${theme.primary};
  --fab-primary-hover: ${theme.primaryHover};
  --fab-danger: ${theme.danger};
  --fab-bg: ${theme.surface};
  --fab-border: ${theme.border};
  --fab-text: ${theme.text};
}
#mail-fab {
  position: fixed; bottom: 24px; right: 24px; z-index: 9999;
  display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
@media (max-width: 640px) { #mail-fab { bottom: 16px; right: 16px; } }
#mail-fab .fab-main {
  width: 52px; height: 52px; border-radius: 50%;
  background: var(--fab-primary); color: #fff; border: none;
  font-size: 22px; cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .35);
  transition: transform .2s, background .2s;
  -webkit-tap-highlight-color: transparent;
}
#mail-fab .fab-main:hover { background: var(--fab-primary-hover); }
#mail-fab .fab-main.open { transform: rotate(45deg); background: var(--fab-border); }
#mail-fab .fab-actions {
  display: none; flex-direction: column; align-items: flex-end; gap: 8px;
}
#mail-fab .fab-actions.show { display: flex; }
#mail-fab .fab-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 18px; border-radius: 24px; border: none;
  color: #fff; font-size: 14px; cursor: pointer;
  box-shadow: 0 2px 10px rgba(0, 0, 0, .3);
  white-space: nowrap; transition: opacity .2s;
  -webkit-tap-highlight-color: transparent;
}
@media (max-width: 640px) { #mail-fab .fab-btn { padding: 12px 20px; font-size: 15px; } }
#mail-fab .fab-btn:disabled { opacity: .5; cursor: default; }
#mail-fab .fab-btn.inbox { background: var(--fab-primary); }
#mail-fab .fab-btn.del { background: var(--fab-danger); }
#mail-fab .fab-btn.star { background: #f59e0b; }
#mail-fab .fab-btn.starred { background: #22c55e; }
#mail-fab .fab-btn.archive { background: #6366f1; }
#mail-fab .fab-status {
  background: var(--fab-bg); color: var(--fab-text);
  padding: 8px 16px; border-radius: 16px; font-size: 13px;
  border: 1px solid var(--fab-border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, .3);
  display: none; max-width: 260px; text-align: center;
}
#mail-fab .fab-status.show { display: block; }
`.trim();
