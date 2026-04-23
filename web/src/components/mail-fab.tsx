import { Spinner } from "@heroui/react";
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
 * 邮件预览页右下角的悬浮操作按钮组。展开时从主按钮向上叠加动作按钮，
 * 每个按钮 POST 到 `/api/mail/:id/<action>`（Worker 侧 token 鉴权，不走 initData）。
 *
 * 定位：`fixed` + `env(safe-area-inset-bottom)` 让 iOS 底部手势区 / 刘海机型
 * 的安全区也避让开；外层 `position: fixed` 确保视口相对定位，不吃父级变换。
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
  /** 某些 action（trash/mark-as-junk）成功后整封邮件状态改变，其余 FAB 按钮禁用 */
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
    setStatus(null); // pending 态用按钮内联 Spinner 反馈，不占浮层气泡
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

  const isBusy = pending != null;

  return (
    <div
      className="fixed z-[9999] flex flex-col items-end gap-2 pointer-events-none"
      style={{
        // iOS 安全区 + 基础内边距；右侧同理避让刘海屏
        bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
        right: "calc(1rem + env(safe-area-inset-right, 0px))",
      }}
    >
      {status && (
        <div className="pointer-events-auto bg-[color:var(--surface)] text-[color:var(--surface-foreground)] px-4 py-2 rounded-2xl text-[13px] border border-[color:var(--surface-secondary)] shadow-lg max-w-[280px] text-center">
          {status}
        </div>
      )}

      {open && (
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {!inArchive && (
            <ActionButton
              label={starred ? "✅ 已星标" : "⭐ 星标"}
              busy={pending === "toggle-star"}
              disabled={allDisabled || isBusy}
              tint={starred ? "success" : "star"}
              onClick={() => onAction("toggle-star")}
            />
          )}
          {inJunk ? (
            <>
              <ActionButton
                label="📥 移到收件箱"
                busy={pending === "move-to-inbox"}
                disabled={allDisabled || isBusy}
                tint="primary"
                onClick={() => onAction("move-to-inbox")}
              />
              <ActionButton
                label="🗑 删除邮件"
                busy={pending === "trash"}
                disabled={allDisabled || isBusy}
                tint="danger"
                onClick={() => onAction("trash")}
              />
            </>
          ) : inArchive ? (
            <ActionButton
              label="📥 移出归档"
              busy={pending === "unarchive"}
              disabled={allDisabled || isBusy}
              tint="primary"
              onClick={() => onAction("unarchive")}
            />
          ) : (
            <>
              {canArchive && (
                <ActionButton
                  label="📥 归档"
                  busy={pending === "archive"}
                  disabled={allDisabled || isBusy}
                  tint="archive"
                  onClick={() => onAction("archive")}
                />
              )}
              <ActionButton
                label="🚫 标记为垃圾"
                busy={pending === "mark-as-junk"}
                disabled={allDisabled || isBusy}
                tint="danger"
                onClick={() => onAction("mark-as-junk")}
              />
            </>
          )}
        </div>
      )}

      {/* 主按钮用原生 button + 自定义样式：HeroUI Button 的 !important 会跟
          Tailwind 尺寸 utility 打架，导致圆形 FAB 被它的内置 padding 撑形 */}
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setStatus(null);
        }}
        aria-label={open ? "收起操作" : "展开操作"}
        className={`pointer-events-auto inline-flex items-center justify-center w-14 h-14 rounded-full text-2xl leading-none bg-[color:var(--accent)] text-[color:var(--accent-foreground)] shadow-[0_6px_20px_rgba(0,0,0,0.35)] active:scale-95 transition-transform duration-150 ${
          open ? "rotate-45" : ""
        }`}
      >
        ⚡
      </button>
    </div>
  );
}

function ActionButton({
  label,
  busy,
  disabled,
  tint,
  onClick,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  tint: "primary" | "danger" | "success" | "star" | "archive";
  onClick: () => void;
}) {
  // 五种色调映射：primary/danger 走 HeroUI 语义色，其余用自定义 tailwind
  const tintClass =
    tint === "primary"
      ? "bg-[color:var(--accent)] text-[color:var(--accent-foreground)]"
      : tint === "danger"
        ? "bg-[color:var(--danger)] text-white"
        : tint === "success"
          ? "bg-emerald-500 text-white"
          : tint === "star"
            ? "bg-amber-500 text-white"
            : "bg-indigo-500 text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 rounded-full text-sm font-medium shadow-lg whitespace-nowrap transition-opacity disabled:opacity-50 disabled:cursor-not-allowed ${tintClass}`}
    >
      {busy && <Spinner size="sm" />}
      {label}
    </button>
  );
}
