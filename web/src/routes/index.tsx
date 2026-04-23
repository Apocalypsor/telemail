import { createFileRoute } from "@tanstack/react-router";

/**
 * 域名根 `/`：Telemail 是一个 Telegram Mini App，正常入口是 `/telegram-app`
 * （BotFather Web App URL）。直接访问根路径只是兜底提示，生产里不会走到这里。
 */
function LandingPage() {
  return (
    <div style={{ padding: 24, color: "var(--hint)", textAlign: "center" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Telemail</h1>
      <p>请通过 Telegram 打开 Mini App。</p>
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: LandingPage,
});
