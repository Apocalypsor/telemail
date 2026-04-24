import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryProvider, queryClient } from "@/providers/query";
import { TelegramProvider } from "@/providers/telegram";
import { routeTree } from "./routeTree.gen";
import "./styles/app.css";

/**
 * 单一 SPA 入口 —— web 页面和 Mini App 共用这个 bundle。
 *
 * - TG SDK 在 `index.html` 里无条件加载（~20 KB）；非 TG 浏览器里
 *   `window.Telegram` 不存在，`TelegramProvider` 里的 effect 自动 no-op
 * - `TelegramProvider` 挂根部，子组件 `useTelegram()` 拿到 `null`（浏览器）
 *   或 `TelegramWebApp`（TG 客户端），按需消费
 * - 路由共用：web 路径（`/`、`/mail/:id`、`/preview`、`/junk-check`、
 *   `/login`）和 Mini App 路径（`/telegram-app/*`）在同一棵 routeTree
 */
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root missing");

createRoot(rootEl).render(
  <StrictMode>
    <TelegramProvider>
      <QueryProvider>
        <RouterProvider router={router} />
      </QueryProvider>
    </TelegramProvider>
  </StrictMode>,
);
