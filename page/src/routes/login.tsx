import { api } from "@api/client";
import { botInfoResponseSchema } from "@api/schemas";
import { WebLayout } from "@components/web-layout";
import { Card } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import {
  ROUTE_LOGIN_CALLBACK,
  ROUTE_PUBLIC_BOT_INFO,
} from "@worker/handlers/hono/routes";
import { useEffect, useRef } from "react";
import { z } from "zod";

// `return_to` 登陆成功后跳回的路径（默认 `/`）。
// `denied=1` + `uid` 由 Worker callback 在用户未 approved 时带过来，页面展示
// 拒绝态。其他情况都渲染登录表单。
const searchSchema = z.object({
  return_to: z.string().optional(),
  denied: z.coerce.number().optional(),
  uid: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: zodValidator(searchSchema),
});

function LoginPage() {
  const search = Route.useSearch();
  const returnTo = search.return_to || "/";

  if (search.denied) {
    return (
      <WebLayout subtitle="访问被拒绝">
        <Card className="max-w-md mx-auto mt-16 bg-red-950/30 border border-red-900/50 p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/20 text-3xl mx-auto mb-4">
            🚫
          </div>
          <h1 className="text-xl font-semibold text-red-300 mb-3">
            访问被拒绝
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            你的 Telegram 账号尚未获得批准。请联系管理员开通。
          </p>
          {search.uid && (
            <p className="text-xs text-zinc-600 mt-4 font-mono">
              Telegram ID: {search.uid}
            </p>
          )}
        </Card>
      </WebLayout>
    );
  }

  return (
    <WebLayout subtitle="登录">
      <Card className="max-w-md mx-auto mt-16 bg-zinc-900 border border-zinc-800 p-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-3xl mx-auto mb-4">
          🔐
        </div>
        <h1 className="text-xl font-semibold text-zinc-100 mb-3">请先登录</h1>
        <p className="text-sm text-zinc-500 mb-8 leading-relaxed">
          使用 Telegram 账号登录后才能访问此页面
        </p>
        <LoginWidget returnTo={returnTo} />
      </Card>
    </WebLayout>
  );
}

function LoginWidget({ returnTo }: { returnTo: string }) {
  const botInfo = useQuery({
    queryKey: ["public", "bot-info"],
    queryFn: async () => {
      const raw = await api
        .get(ROUTE_PUBLIC_BOT_INFO.replace(/^\//, ""))
        .json();
      return botInfoResponseSchema.parse(raw);
    },
    retry: false,
    staleTime: Infinity,
  });

  // TG Login Widget 是个 <script>，必须插入 DOM 后它自己去 telegram.org 拉
  // 真正的 widget iframe。React StrictMode 开发时会双挂载 effect，所以要
  // 在 cleanup 里把上一次塞进去的 script 清掉，避免出现两个 widget。
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !botInfo.data) return;
    const { botUsername } = botInfo.data;

    const callbackUrl = `${ROUTE_LOGIN_CALLBACK}?return_to=${encodeURIComponent(returnTo)}`;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-auth-url", callbackUrl);
    script.setAttribute("data-request-access", "write");
    host.appendChild(script);

    return () => {
      host.innerHTML = "";
    };
  }, [botInfo.data, returnTo]);

  if (botInfo.isLoading) {
    return <p className="text-xs text-zinc-600">加载登录组件…</p>;
  }
  if (botInfo.isError) {
    return <p className="text-xs text-red-400">无法加载登录组件，请刷新重试</p>;
  }

  return <div ref={hostRef} className="flex justify-center min-h-[45px]" />;
}
