// Web UI 路径。Worker 端 bot keyboards 也写了一份（src/handlers/hono/routes.ts），
// 改这里要同步那边。
export const ROUTE_MINI_APP = "/telegram-app";
export const ROUTE_MINI_APP_REMINDERS = "/telegram-app/reminders";
export const ROUTE_MINI_APP_MAIL = "/telegram-app/mail/:id";
export const ROUTE_MINI_APP_LIST = "/telegram-app/list/:type";

// 非 Mini App 的 web 页面（浏览器直访，不在 TG WebView 里）
export const ROUTE_MAIL = "/mail/:id";
export const ROUTE_PREVIEW = "/preview";
export const ROUTE_JUNK_CHECK = "/junk-check";
// 登录页仍由 Worker 渲染（/login + /login/callback），SPA 401 时重定向过去。
export const ROUTE_LOGIN = "/login";
