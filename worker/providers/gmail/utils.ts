import { refreshAccessToken } from "@providers/utils";
import { http } from "@utils/http";
import { GMAIL_API, GOOGLE_OAUTH_TOKEN_URL } from "@/constants";
import type { Account, Env } from "@/types";

/** 用 refresh_token 换 access_token（KV 缓存，共用 base.ts 的实现） */
export async function getAccessToken(
  env: Env,
  account: Account,
): Promise<string> {
  return refreshAccessToken(env, account, {
    tokenUrl: GOOGLE_OAUTH_TOKEN_URL,
    clientId: env.GMAIL_CLIENT_ID,
    clientSecret: env.GMAIL_CLIENT_SECRET,
  });
}

/** 调用 Gmail REST API (GET) */
export async function gmailGet<T>(token: string, path: string): Promise<T> {
  return http
    .get(`${GMAIL_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .json() as Promise<T>;
}

/** 调用 Gmail REST API (POST with JSON body) */
export async function gmailPost<T = void>(
  token: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const resp = await http.post(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    json: body,
  });
  const text = await resp.text();
  return (text ? JSON.parse(text) : null) as T;
}
