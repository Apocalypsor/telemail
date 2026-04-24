import { refreshAccessToken } from "@providers/utils";
import { http } from "@utils/http";
import { MS_GRAPH_API, MS_MAIL_SCOPE, MS_OAUTH_TOKEN_URL } from "@/constants";
import type { Account, Env } from "@/types";

/** 用 refresh_token 换 access_token（KV 缓存，共用 base.ts 的实现） */
export async function getAccessToken(
  env: Env,
  account: Account,
): Promise<string> {
  return refreshAccessToken(env, account, {
    tokenUrl: MS_OAUTH_TOKEN_URL,
    clientId: env.MS_CLIENT_ID as string,
    clientSecret: env.MS_CLIENT_SECRET as string,
    extraBody: { scope: MS_MAIL_SCOPE },
    errorLabel: "MS ",
  });
}

/** 调用 Graph API (GET) */
export async function graphGet<T>(token: string, path: string): Promise<T> {
  return http
    .get(`${MS_GRAPH_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .json() as Promise<T>;
}

/** 调用 Graph API (PATCH with JSON body) */
export async function graphPatch(
  token: string,
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  await http.patch(`${MS_GRAPH_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    json: body,
  });
}

/** 调用 Graph API (POST with JSON body) */
export async function graphPost<T = void>(
  token: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const resp = await http.post(`${MS_GRAPH_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    json: body,
  });
  const text = await resp.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** 获取邮件的原始 MIME 内容 */
export async function fetchRawMime(
  token: string,
  messageId: string,
): Promise<ArrayBuffer> {
  return http
    .get(`${MS_GRAPH_API}/me/messages/${messageId}/$value`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .arrayBuffer();
}
