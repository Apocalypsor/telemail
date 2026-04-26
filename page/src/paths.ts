// Mini App UI 路径常量。Worker 端 bot keyboards 通过 `@page/paths` 引用，用来
// 拼 `web_app` URL（worker/bot/handlers/start.ts、mail-list.ts），改这里要确认
// 那边仍然能解析。SPA 路由本身由 TanStack Router 文件路由生成，不依赖这些常量。
export const ROUTE_MINI_APP_REMINDERS = "/telegram-app/reminders";
export const ROUTE_MINI_APP_LIST = "/telegram-app/list/:type";
export const ROUTE_MINI_APP_SEARCH = "/telegram-app/search";
