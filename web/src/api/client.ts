import ky, { HTTPError } from "ky";
import { getInitData } from "@/providers/telegram";

/**
 * 共享 ky 实例：所有 API 调用自动带 `X-Telegram-Init-Data` 头，后端
 * `requireMiniAppAuth` 中间件按此校验身份。
 *
 * `prefixUrl` 必须是**绝对 origin**（如 `https://telemail.dov.moe`），不能
 * 留空。留空时 ky 把相对输入交给 `fetch()` 按文档 base URI 解析 —— Mini App
 * 当前页是 `/telegram-app/reminders`，`fetch("api/reminders")` 会被解成
 * `/telegram-app/api/reminders`，打到 Pages，Worker Route 接不到。用
 * `window.location.origin` 在 dev（Vite :5173，proxy 转发 /api/*）和生产
 * （Pages + Worker 同域 Routes）两处自然都对。
 */
export const api = ky.create({
  prefixUrl:
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  retry: 0,
  // session cookie 页面（/preview, /junk-check）依赖浏览器自动带 cookie；
  // same-origin 默认就是 "same-origin"，显式写上更清楚
  credentials: "same-origin",
  hooks: {
    beforeRequest: [
      (req) => {
        const initData = getInitData();
        if (initData) req.headers.set("X-Telegram-Init-Data", initData);
      },
    ],
  },
});

/**
 * session-auth 页面（/preview, /junk-check）碰到 401 时：跳登录页带 return_to。
 * 返回 true 表示已经触发跳转，调用方应该立即终止后续处理。
 */
export function redirectToLoginOnUnauthorized(err: unknown): boolean {
  if (err instanceof HTTPError && err.response.status === 401) {
    const here = window.location.pathname + window.location.search;
    window.location.href = `/login?return_to=${encodeURIComponent(here)}`;
    return true;
  }
  return false;
}

/** 从 API 错误响应里挖 error 字段；拿不到就用 HTTP status 文本兜底 */
export async function extractErrorMessage(err: unknown): Promise<string> {
  if (err instanceof HTTPError) {
    try {
      const body = await err.response.json<{ error?: string }>();
      if (body.error) return body.error;
    } catch {
      /* ignore */
    }
    return err.response.statusText || `HTTP ${err.response.status}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
