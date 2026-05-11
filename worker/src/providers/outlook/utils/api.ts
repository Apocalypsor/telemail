import { http } from "@worker/clients/http";
import { MS_GRAPH_API } from "@worker/constants";

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
