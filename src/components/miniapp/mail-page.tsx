import { MiniAppShell } from "@components/miniapp/layout";
import { MailFab, type MailFabProps } from "@components/shared/mail-fab";
import type { Child } from "hono/jsx";
import type { MailMeta } from "@/types";

interface MiniAppMailPageProps extends MailFabProps {
  meta: MailMeta;
  accountEmail?: string | null;
  /** "在浏览器打开"链接（保留原 folder 参数的 web 版 mail page URL） */
  webMailUrl: string;
  /** 跳回 TG 里原邮件消息的深链接，没 mapping 时省略 */
  tgMessageLink?: string;
  children: Child;
}

const PAGE_CSS = `
html { padding: 0; }
.mail-meta {
  background: var(--surface);
  border-bottom: 1px solid var(--separator);
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.7;
}
.mail-meta .subject {
  font-size: 22px; font-weight: 600; margin-bottom: 6px; word-break: break-word;
  color: var(--tg-theme-link-color, #60a5fa);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.mail-meta .subject:active { opacity: .6; }
.mail-meta .subject .ext { font-size: 14px; opacity: .7; margin-left: 4px; }
.mail-meta .actions { margin-top: 6px; display: flex; gap: 12px; flex-wrap: wrap; }
.mail-meta .actions a {
  font-size: 12px; color: var(--tg-theme-link-color, #60a5fa);
  text-decoration: none; -webkit-tap-highlight-color: transparent;
}
.mail-meta .actions a:active { opacity: .6; }
.mail-meta .label { color: var(--hint); }
.mail-body { padding: 16px; padding-bottom: 100px; word-break: break-word; }
`.trim();

/** Mini app mail 页特有的初始化：
 *  - TG WebApp ready/expand
 *  - BackButton：URL 带 ?back= 时显示，点击跳回该 URL
 *  - 头部链接：用 `data-mini-link` 属性标记，event 委托走 tg.openLink /
 *    tg.openTelegramLink，避免在 a 标签上写 inline onclick
 */
const MAIL_PAGE_SCRIPT = `
(function () {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready(); tg.expand();
    if (tg.BackButton) {
      var backUrl = new URLSearchParams(location.search).get('back');
      if (backUrl) {
        tg.BackButton.show();
        tg.BackButton.onClick(function () { location.href = backUrl; });
      } else {
        tg.BackButton.hide();
      }
    }
  }
  document.querySelectorAll('[data-mini-link]').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      ev.preventDefault();
      var kind = a.dataset.miniLink;
      var url = a.href;
      // openTelegramLink 处理 t.me/* 链接，跳到 TG 内对应聊天/消息。
      // 文档说会自动关 Mini App，实测部分客户端不会 —— 显式 close() 兜底。
      if (kind === 'tg' && tg && tg.openTelegramLink) {
        tg.openTelegramLink(url);
        setTimeout(function () { if (tg.close) tg.close(); }, 50);
      } else if (tg && tg.openLink) {
        tg.openLink(url);
      } else {
        window.open(url, '_blank');
      }
    });
  });
})();
`.trim();

function MailMetaHeader({
  meta,
  accountEmail,
  webMailUrl,
  tgMessageLink,
}: {
  meta: MailMeta;
  accountEmail?: string | null;
  webMailUrl: string;
  tgMessageLink?: string;
}) {
  if (!meta.subject && !meta.from && !meta.to && !accountEmail && !meta.date)
    return null;

  return (
    <div class="mail-meta">
      {meta.subject && (
        <a
          class="subject"
          href={webMailUrl}
          data-mini-link="browser"
          title="在浏览器打开"
        >
          {meta.subject}
          <span class="ext">↗</span>
        </a>
      )}
      {tgMessageLink && (
        <div class="actions">
          <a href={tgMessageLink} data-mini-link="tg">
            💬 跳到 TG 原消息
          </a>
        </div>
      )}
      {meta.from && (
        <div>
          <span class="label">From:</span> {meta.from}
        </div>
      )}
      {meta.to && (
        <div>
          <span class="label">To:</span> {meta.to}
        </div>
      )}
      {accountEmail && (
        <div>
          <span class="label">Account:</span> {accountEmail}
        </div>
      )}
      {meta.date && (
        <div>
          <span class="label">Date:</span> {meta.date}
        </div>
      )}
    </div>
  );
}

export function MiniAppMailPage({
  meta,
  accountEmail,
  webMailUrl,
  tgMessageLink,
  children,
  ...fabProps
}: MiniAppMailPageProps) {
  return (
    <MiniAppShell
      title={`${meta.subject || "邮件"} — Telemail`}
      extraCss={PAGE_CSS}
    >
      <MailMetaHeader
        meta={meta}
        accountEmail={accountEmail}
        webMailUrl={webMailUrl}
        tgMessageLink={tgMessageLink}
      />
      <div class="mail-body">{children}</div>
      <MailFab {...fabProps} />
      <script dangerouslySetInnerHTML={{ __html: MAIL_PAGE_SCRIPT }} />
    </MiniAppShell>
  );
}
