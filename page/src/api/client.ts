import { getInitData } from "@providers/telegram";
import ky from "ky";

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
