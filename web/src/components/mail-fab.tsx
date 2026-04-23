import { useState } from "react";
import { api, extractErrorMessage } from "@/lib/api";
import { okResponseSchema } from "@/lib/schemas";

export interface MailFabProps {
  emailMessageId: string;
  accountId: number;
  token: string;
  starred: boolean;
  inJunk: boolean;
  inArchive: boolean;
  canArchive: boolean;
  /** FAB 动作成功后通知父组件 refetch 预览数据；交给 caller 处理 */
  onChanged?: () => void;
}

type Action =
  | "toggle-star"
  | "archive"
  | "unarchive"
  | "trash"
  | "mark-as-junk"
  | "move-to-inbox";

/**
 * 邮件预览页右下角的悬浮操作按钮组。替掉原 web + miniapp 共用的 Hono JSX 版。
 * 每个按钮 POST 到 `/api/mail/:id/<action>`（Worker 侧 token 鉴权，不走 initData）。
 */
export function MailFab({
  emailMessageId,
  accountId,
  token,
  starred: initialStarred,
  inJunk,
  inArchive,
  canArchive,
  onChanged,
}: MailFabProps) {
  const [open, setOpen] = useState(false);
  const [starred, setStarred] = useState(initialStarred);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  /** 某些 action（trash/mark-as-junk）成功后整个邮件被移走，其余 FAB 按钮禁用 */
  const [allDisabled, setAllDisabled] = useState(false);

  async function callAction(
    action: Action,
    extra: Record<string, unknown> = {},
  ): Promise<{ ok: boolean; message?: string; error?: string }> {
    const res = await api
      .post(`api/mail/${encodeURIComponent(emailMessageId)}/${action}`, {
        json: { accountId, token, ...extra },
      })
      .json();
    return okResponseSchema.parse(res);
  }

  async function onAction(action: Action) {
    setPending(action);
    setStatus("处理中...");
    try {
      if (action === "toggle-star") {
        const next = !starred;
        const d = await callAction("toggle-star", { starred: next });
        if (d.ok) {
          setStarred(next);
          setStatus(`✅ ${d.message ?? ""}`);
          onChanged?.();
        } else {
          setStatus(`❌ ${d.error ?? "操作失败"}`);
        }
      } else {
        const d = await callAction(action);
        if (d.ok) {
          setStatus(`✅ ${d.message ?? ""}`);
          setAllDisabled(true);
          onChanged?.();
        } else {
          setStatus(`❌ ${d.error ?? "操作失败"}`);
        }
      }
    } catch (e) {
      setStatus(`❌ ${await extractErrorMessage(e)}`);
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <style>{FAB_CSS}</style>
      <div id="mail-fab">
        {status && <div className="fab-status show">{status}</div>}
        <div className={`fab-actions${open ? " show" : ""}`}>
          {!inArchive && (
            <FabButton
              className={starred ? "starred" : "star"}
              disabled={allDisabled || pending != null}
              onClick={() => onAction("toggle-star")}
            >
              {starred ? "✅ 已星标" : "⭐ 星标"}
            </FabButton>
          )}
          {inJunk ? (
            <>
              <FabButton
                className="inbox"
                disabled={allDisabled || pending != null}
                onClick={() => onAction("move-to-inbox")}
              >
                📥 移到收件箱
              </FabButton>
              <FabButton
                className="del"
                disabled={allDisabled || pending != null}
                onClick={() => onAction("trash")}
              >
                🗑 删除邮件
              </FabButton>
            </>
          ) : inArchive ? (
            <FabButton
              className="inbox"
              disabled={allDisabled || pending != null}
              onClick={() => onAction("unarchive")}
            >
              📥 移出归档
            </FabButton>
          ) : (
            <>
              {canArchive && (
                <FabButton
                  className="archive"
                  disabled={allDisabled || pending != null}
                  onClick={() => onAction("archive")}
                >
                  📥 归档
                </FabButton>
              )}
              <FabButton
                className="del"
                disabled={allDisabled || pending != null}
                onClick={() => onAction("mark-as-junk")}
              >
                🚫 标记为垃圾
              </FabButton>
            </>
          )}
        </div>
        <button
          type="button"
          className={`fab-main${open ? " open" : ""}`}
          onClick={() => {
            setOpen((v) => !v);
            setStatus(null);
          }}
        >
          ⚡
        </button>
      </div>
    </>
  );
}

function FabButton({
  className,
  disabled,
  onClick,
  children,
}: {
  className: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`fab-btn ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const FAB_CSS = `
#mail-fab {
  position: fixed; bottom: 24px; right: 24px; z-index: 9999;
  display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
@media (max-width: 640px) { #mail-fab { bottom: 16px; right: 16px; } }
#mail-fab .fab-main {
  width: 52px; height: 52px; border-radius: 50%;
  background: var(--button); color: #fff; border: none;
  font-size: 22px; cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .35);
  transition: transform .2s, background .2s;
  -webkit-tap-highlight-color: transparent;
}
#mail-fab .fab-main.open { transform: rotate(45deg); background: var(--border); }
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
  font-family: inherit;
}
@media (max-width: 640px) { #mail-fab .fab-btn { padding: 12px 20px; font-size: 15px; } }
#mail-fab .fab-btn:disabled { opacity: .5; cursor: default; }
#mail-fab .fab-btn.inbox { background: var(--button); }
#mail-fab .fab-btn.del { background: var(--danger); }
#mail-fab .fab-btn.star { background: #f59e0b; }
#mail-fab .fab-btn.starred { background: #22c55e; }
#mail-fab .fab-btn.archive { background: #6366f1; }
#mail-fab .fab-status {
  background: var(--surface); color: var(--text);
  padding: 8px 16px; border-radius: 16px; font-size: 13px;
  border: 1px solid var(--border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, .3);
  display: none; max-width: 260px; text-align: center;
}
#mail-fab .fab-status.show { display: block; }
`.trim();
