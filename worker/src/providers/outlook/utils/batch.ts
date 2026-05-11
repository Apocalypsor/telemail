import { http } from "@worker/clients/http";
import { MS_GRAPH_API } from "@worker/constants";

/** Graph $batch 单个子请求的形状（详见 https://learn.microsoft.com/graph/json-batching） */
export interface GraphBatchRequest {
  id: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** 注意：path 里不要加 `/v1.0` 前缀，Graph 已自动加上 */
  url: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface GraphBatchResponse<T = unknown> {
  id: string;
  status: number;
  body?: T & { error?: { code?: string; message?: string } };
  headers?: Record<string, string>;
}

/**
 * Graph `$batch` 端点：JSON 格式塞最多 20 个子请求，1 个 HTTP 调用拿全 20 条响应。
 * 内部自动按 20 切片串行批次（保留请求顺序）；request body 里如果有 JSON
 * payload，会自动把 `Content-Type: application/json` 头补上。
 *
 * 子请求失败（4xx/5xx）不会让整批 throw —— 在响应数组里以非 2xx 状态返回，
 * 调用方按 `status` 判断。整批 POST 本身失败（auth / 5xx）才抛。
 */
export async function graphBatch(
  token: string,
  requests: GraphBatchRequest[],
): Promise<GraphBatchResponse[]> {
  if (requests.length === 0) return [];

  const all: GraphBatchResponse[] = [];
  const CHUNK = 20;
  for (let i = 0; i < requests.length; i += CHUNK) {
    const chunk = requests.slice(i, i + CHUNK).map((r) => ({
      id: r.id,
      method: r.method,
      url: r.url,
      ...(r.body !== undefined && {
        body: r.body,
        headers: { "Content-Type": "application/json", ...(r.headers ?? {}) },
      }),
      ...(r.body === undefined &&
        r.headers && {
          headers: r.headers,
        }),
    }));
    const resp = await http.post(`${MS_GRAPH_API}/$batch`, {
      headers: { Authorization: `Bearer ${token}` },
      json: { requests: chunk },
    });
    const data = (await resp.json()) as { responses?: GraphBatchResponse[] };
    if (Array.isArray(data.responses)) all.push(...data.responses);
  }
  return all;
}
