import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { initTelegramChrome } from "@/lib/tg";

interface RouterContext {
  queryClient: QueryClient;
}

function RootLayout() {
  // TG chrome 初始化：挂载时 ready/expand + 默认隐藏 BackButton。
  // 需要返回的子页面自己在 effect 里 show + 绑定 onClick，卸载时 hide —— 不
  // 在这里统一重置，否则子页面刚 show 就被盖掉。
  useEffect(() => {
    initTelegramChrome();
  }, []);

  return <Outlet />;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});
