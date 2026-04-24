import auth from "@handlers/hono/auth";
import miniapp from "@handlers/hono/miniapp";
import oauth from "@handlers/hono/oauth";
import preview from "@handlers/hono/preview";
import providers from "@handlers/hono/providers";
import telegram from "@handlers/hono/telegram";
import { reportErrorToObservability } from "@utils/observability";
import { Hono } from "hono";
import type { AppEnv } from "@/types";

const app = new Hono<AppEnv>();

// Favicon 由 Pages 直接 serve（`page/public/favicon.png`），Workers Routes
// 只匹配 `/api/*` + `/oauth/*`，`/favicon.png` 不会到 Worker 这里。

// ─── Error handler ──────────────────────────────────────────────────────────
app.onError(async (error, c) => {
  await reportErrorToObservability(c.env, "http.unhandled_error", error, {
    method: c.req.method,
    pathname: new URL(c.req.url).pathname,
  });
  return c.text("Internal Server Error", 500);
});

// ─── Mount sub-routers ──────────────────────────────────────────────────────
app.route("", auth);
app.route("", telegram);
app.route("", providers);
app.route("", oauth);
app.route("", preview);
app.route("", miniapp);

export default app;
