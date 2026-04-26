import { useCallback, useRef, useState } from "react";
import { api } from "@/api/client";
import { okResponseSchema } from "@/api/schemas";
import { extractErrorMessage } from "@/api/utils";

/**
 * 邮件预览页能触发的服务端动作。和 worker `routes.ts` 里 ROUTE_MAIL_*
 * 一一对应：toggle-star / archive / unarchive / trash / mark-as-junk /
 * move-to-inbox。
 */
export type MailAction =
  | "toggle-star"
  | "archive"
  | "unarchive"
  | "trash"
  | "mark-as-junk"
  | "move-to-inbox";

/** 终端动作 —— 执行后邮件就离开当前视图（归档/删除/标垃圾），UI 应隐藏后续操作入口。 */
const TERMINAL_ACTIONS: ReadonlySet<MailAction> = new Set([
  "archive",
  "unarchive",
  "trash",
  "mark-as-junk",
  "move-to-inbox",
]);

export function isTerminalMailAction(action: MailAction): boolean {
  return TERMINAL_ACTIONS.has(action);
}

export interface MailActionResult {
  action: MailAction;
  /** toggle-star 时携带本次切到的 starred 状态 */
  starredNext?: boolean;
  ok: boolean;
  /** 服务端 200 但 ok=false 时的错误信息，或网络错误信息 */
  error?: string;
  /** 服务端 ok=true 时返回的提示文案 */
  message?: string;
}

export interface UseMailActionsParams {
  emailMessageId: string;
  accountId: number;
  token: string;
  initialStarred: boolean;
  /** 任意动作成功后回调（caller 一般用来 invalidate query 重拉预览） */
  onChanged?: () => void;
}

export interface UseMailActionsReturn {
  starred: boolean;
  /** 任一 terminal 动作成功后变 true，UI 应隐藏后续入口 */
  done: boolean;
  pending: boolean;
  /**
   * 触发一次动作。返回 result 让 caller 决定如何反馈（web 用 Chip，
   * Mini App 用 TG showAlert + HapticFeedback）。`toggle-star` 时
   * `starredNext` 必填。
   */
  run: (action: MailAction, starredNext?: boolean) => Promise<MailActionResult>;
}

/**
 * 邮件预览页操作的共享逻辑：发 POST /api/mail/:id/<action>，维护本地
 * starred / done / pending state，成功调 onChanged。UI 反馈（toast / Chip /
 * TG popup）交给 caller。
 *
 * web `routes/mail.$id.tsx` 的 WebMailToolbar 和 Mini App
 * `components/mail-fab.tsx` 共用这个 hook。
 */
export function useMailActions(
  params: UseMailActionsParams,
): UseMailActionsReturn {
  const [starred, setStarred] = useState(params.initialStarred);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  // 把每次新 props 塞进 ref：run 用最新的 emailMessageId/accountId/token，
  // 不需要把它们放进 useCallback deps，避免每次 render 重建 run 引用。
  const propsRef = useRef(params);
  propsRef.current = params;

  const run = useCallback(
    async (
      action: MailAction,
      starredNext?: boolean,
    ): Promise<MailActionResult> => {
      const { emailMessageId, accountId, token, onChanged } = propsRef.current;
      setPending(true);
      try {
        const body: Record<string, unknown> = { accountId, token };
        if (starredNext !== undefined) body.starred = starredNext;
        const raw = await api
          .post(`api/mail/${encodeURIComponent(emailMessageId)}/${action}`, {
            json: body,
          })
          .json();
        const res = okResponseSchema.parse(raw);
        if (!res.ok) {
          return { action, starredNext, ok: false, error: res.error };
        }
        if (action === "toggle-star" && starredNext !== undefined) {
          setStarred(starredNext);
        }
        if (isTerminalMailAction(action)) setDone(true);
        onChanged?.();
        return { action, starredNext, ok: true, message: res.message };
      } catch (err) {
        return {
          action,
          starredNext,
          ok: false,
          error: await extractErrorMessage(err),
        };
      } finally {
        setPending(false);
      }
    },
    [],
  );

  return { starred, done, pending, run };
}
