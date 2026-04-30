import { Skeleton } from "@heroui/react";
import { api } from "@page/api/client";
import { extractErrorMessage } from "@page/api/utils";
import { useBackButton } from "@page/hooks/use-back-button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { retrieveLaunchParams } from "@telegram-apps/sdk-react";
import { useEffect, useMemo, useState } from "react";

/**
 * 入口路由（`/telegram-app/`，对应 BotFather `/newapp` 注册的 Web App URL）。
 * 群聊 deep link `t.me/<bot>/<short>?startapp=<prefix>_<chatId>_<tgMsgId>`
 * 唯一会落到这里。读 `start_param` 前缀决定跳哪去：
 *   r_<chatId>_<tgMsgId>  → /telegram-app/reminders?accountId=&emailMessageId=&token=
 *   m_<chatId>_<tgMsgId>  → /telegram-app/mail/$id?accountId=&t=
 *   <chatId>_<tgMsgId>    → /telegram-app/reminders（兼容旧按钮，无前缀 = reminder）
 *   无 start_param         → /telegram-app/reminders（列表模式，主菜单"我的提醒"）
 */
function RouterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  // 路由中转页本身不是停留页，不显示 BackButton
  useBackButton(undefined);

  // 同步解析一次 start_param —— 用于决定 skeleton 形态（mail vs 列表），不放到
  // useEffect 里是因为副作用与渲染选择来自同一份输入，没有先后依赖。
  const startParam = useMemo(() => {
    try {
      return retrieveLaunchParams().tgWebAppData?.start_param ?? "";
    } catch {
      return "";
    }
  }, []);
  const isMailEntry = /^m_(-?\d+)_(\d+)$/.test(startParam);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!startParam) {
        navigate({ to: "/telegram-app/reminders", search: {}, replace: true });
        return;
      }

      const m = startParam.match(/^(?:([a-z])_)?(-?\d+)_(\d+)$/);
      if (!m) {
        setError("无效的入口参数");
        return;
      }
      const feature = m[1] || "r";
      const chatId = m[2];
      const tgMsgId = m[3];

      try {
        const { data, error } = await api.api.reminders["resolve-context"].get({
          query: { start: `${chatId}_${tgMsgId}` },
        });
        if (cancelled) return;
        if (error) throw error;
        const ctx = data;
        if (feature === "m") {
          navigate({
            to: "/telegram-app/mail/$id",
            params: { id: ctx.emailMessageId },
            search: { accountId: ctx.accountId, t: ctx.token },
            replace: true,
          });
        } else {
          navigate({
            to: "/telegram-app/reminders",
            search: {
              accountId: ctx.accountId,
              emailMessageId: ctx.emailMessageId,
              token: ctx.token,
            },
            replace: true,
          });
        }
      } catch (e) {
        if (cancelled) return;
        setError(await extractErrorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, startParam]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-xl border border-red-900/50 bg-red-950/30 p-6 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }
  return isMailEntry ? <MailSkeleton /> : <RemindersSkeleton />;
}

// 跟 /telegram-app/mail/$id 的 loading 占位保持一致 —— 跳转后两个 skeleton 在
// 视觉上无缝衔接，避免"先看到一种 skeleton，再看到另一种"的闪烁。
function MailSkeleton() {
  return (
    <article className="max-w-3xl mx-auto px-4 py-6 animate-pulse space-y-4">
      <Skeleton className="h-9 w-2/3 rounded-md" />
      <Skeleton className="h-4 w-1/3 rounded-md" />
      <Skeleton className="h-4 w-1/2 rounded-md" />
      <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-3">
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-11/12 rounded-md" />
        <Skeleton className="h-4 w-10/12 rounded-md" />
        <Skeleton className="h-4 w-9/12 rounded-md" />
      </div>
    </article>
  );
}

// reminders 页面默认走列表 —— 给一个标题 + 几条 timeline 占位条目。形态贴近
// `ReminderTimeline` 的 loading 分支，让跳转过去的接续看不出断层。
function RemindersSkeleton() {
  return (
    <div className="max-w-xl mx-auto px-3 py-4 sm:p-6 space-y-5 animate-pulse">
      <Skeleton className="h-7 w-32 rounded-md" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-2 sm:gap-3 items-start">
            <Skeleton className="w-16 h-4 rounded mt-3.5 shrink-0" />
            <div className="w-4 shrink-0 flex justify-center pt-5">
              <Skeleton className="w-3 h-3 rounded-full" />
            </div>
            <Skeleton className="flex-1 h-20 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/telegram-app/")({
  component: RouterPage,
});
