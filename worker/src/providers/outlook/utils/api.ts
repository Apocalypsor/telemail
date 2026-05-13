import { http } from "@worker/clients/http";
import { MS_GRAPH_API, MS_GRAPH_API_BETA } from "@worker/constants";

const resolveGraphUrl = (path: string): string => {
  if (!path.startsWith("http")) return `${MS_GRAPH_API}${path}`;
  if (
    path === MS_GRAPH_API ||
    path.startsWith(`${MS_GRAPH_API}/`) ||
    path === MS_GRAPH_API_BETA ||
    path.startsWith(`${MS_GRAPH_API_BETA}/`)
  ) {
    return path;
  }
  throw new Error("Invalid Microsoft Graph URL");
};

/** 调用 Graph API (GET) */
export const graphGet = async <T>(token: string, path: string): Promise<T> => {
  const url = resolveGraphUrl(path);
  return http
    .get(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .json() as Promise<T>;
};

/** 调用 Graph API (PATCH with JSON body) */
export const graphPatch = async (
  token: string,
  path: string,
  body: Record<string, unknown>,
): Promise<void> => {
  await http.patch(`${MS_GRAPH_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    json: body,
  });
};

/** 调用 Graph API (POST with JSON body) */
export const graphPost = async <T = void>(
  token: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> => {
  const resp = await http.post(`${MS_GRAPH_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    json: body,
  });
  const text = await resp.text();
  return (text ? JSON.parse(text) : null) as T;
};
