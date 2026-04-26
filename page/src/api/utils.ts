import { HTTPError } from "ky";

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
