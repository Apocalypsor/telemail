import { FAB_CSS } from "@components/shared/fab-styles";

export interface MailFabProps {
  emailMessageId: string;
  accountId: number;
  token: string;
  starred: boolean;
  inJunk: boolean;
  inArchive: boolean;
  canArchive: boolean;
}

/**
 * 邮件预览页右下角的悬浮操作按钮组（star / archive / move-to-inbox / mark-as-junk
 * / trash），web 版和 mini app 版共用。
 *
 * **per-request 数据全部走 `data-*` 属性**（emailMessageId / accountId / token /
 * starred）—— `MAIL_FAB_SCRIPT` 是一个静态字符串，没有任何模板替换。这样就把
 * "动态值散落在 JS 里" 收敛回声明式 HTML。
 *
 * 按钮分发用 `data-action` + 容器事件委托。
 */
export function MailFab({
  emailMessageId,
  accountId,
  token,
  starred,
  inJunk,
  inArchive,
  canArchive,
}: MailFabProps) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FAB_CSS }} />
      <div
        id="mail-fab"
        data-email-id={emailMessageId}
        data-account-id={accountId}
        data-token={token}
        data-starred={starred ? "true" : "false"}
      >
        <div id="fab-status" class="fab-status" />
        <div id="fab-actions" class="fab-actions">
          {!inArchive && (
            <button
              type="button"
              class={`fab-btn ${starred ? "starred" : "star"}`}
              data-action="toggle-star"
            >
              {starred ? "✅ 已星标" : "⭐ 星标"}
            </button>
          )}
          {inJunk ? (
            <>
              <button
                type="button"
                class="fab-btn inbox"
                data-action="move-to-inbox"
              >
                📥 移到收件箱
              </button>
              <button type="button" class="fab-btn del" data-action="trash">
                🗑 删除邮件
              </button>
            </>
          ) : inArchive ? (
            <button type="button" class="fab-btn inbox" data-action="unarchive">
              📥 移出归档
            </button>
          ) : (
            <>
              {canArchive && (
                <button
                  type="button"
                  class="fab-btn archive"
                  data-action="archive"
                >
                  📥 归档
                </button>
              )}
              <button
                type="button"
                class="fab-btn del"
                data-action="mark-as-junk"
              >
                🚫 标记为垃圾
              </button>
            </>
          )}
        </div>
        <button type="button" class="fab-main" data-action="toggle-fab">
          ⚡
        </button>
      </div>
      <script dangerouslySetInnerHTML={{ __html: MAIL_FAB_SCRIPT }} />
    </>
  );
}

const MAIL_FAB_SCRIPT = `
(function () {
  var fab = document.getElementById('mail-fab');
  if (!fab) return;
  var cfg = {
    emailId: fab.dataset.emailId,
    accountId: Number(fab.dataset.accountId),
    token: fab.dataset.token,
  };
  var starred = fab.dataset.starred === 'true';
  var status = document.getElementById('fab-status');
  var actions = document.getElementById('fab-actions');
  var mainBtn = fab.querySelector('.fab-main');

  function setStatus(text, show) {
    status.textContent = text;
    status.className = show ? 'fab-status show' : 'fab-status';
  }

  function disableAll() {
    fab.querySelectorAll('.fab-btn').forEach(function (b) { b.disabled = true; });
  }

  async function callAction(path, body) {
    var r = await fetch('/api/mail/' + encodeURIComponent(cfg.emailId) + '/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ accountId: cfg.accountId, token: cfg.token }, body || {})),
    });
    return r.json();
  }

  fab.addEventListener('click', async function (ev) {
    var btn = ev.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;

    if (action === 'toggle-fab') {
      mainBtn.classList.toggle('open');
      actions.classList.toggle('show');
      setStatus('', false);
      return;
    }

    btn.disabled = true;
    setStatus('处理中...', true);
    try {
      if (action === 'toggle-star') {
        var d = await callAction('toggle-star', { starred: !starred });
        if (d.ok) {
          starred = !starred;
          btn.className = starred ? 'fab-btn starred' : 'fab-btn star';
          btn.textContent = starred ? '\\u2705 已星标' : '\\u2B50 星标';
          setStatus('\\u2705 ' + d.message, true);
        } else {
          setStatus('\\u274c ' + (d.error || '操作失败'), true);
        }
        btn.disabled = false;
      } else {
        var d = await callAction(action);
        if (d.ok) {
          setStatus('\\u2705 ' + d.message, true);
          disableAll();
        } else {
          setStatus('\\u274c ' + (d.error || '操作失败'), true);
          btn.disabled = false;
        }
      }
    } catch (e) {
      setStatus('\\u274c 网络错误', true);
      btn.disabled = false;
    }
  });
})();
`.trim();
