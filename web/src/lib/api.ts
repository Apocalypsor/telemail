import ky, { HTTPError } from "ky";
import { getInitData } from "./tg";

/**
 * 共享 ky 实例：所有 API 调用都自动带 `X-Telegram-Init-Data` 头，后端的
 * `requireMiniAppAuth` 中间件按此校验身份。Pages + Worker 同域部署（方案 A，
 * `telemail.app/api/*` 由 Workers Route 转发到 Worker），所以 baseURL 用相对路径。
 */
export const api = ky.create({
  prefixUrl: "",
  retry: 0,
  hooks: {
    beforeRequest: [
      (req) => {
        const initData = getInitData();
        if (initData) req.headers.set("X-Telegram-Init-Data", initData);
      },
    ],
  },
});

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
