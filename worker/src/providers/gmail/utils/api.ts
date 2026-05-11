import { http } from "@worker/clients/http";
import { GMAIL_API } from "@worker/constants";

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
