import { treaty } from "@elysiajs/eden";
import type { App as MiddlewareApp } from "@middleware/index";
import {
  IMAP_BRIDGE_CONTAINER_NAME,
  IMAP_BRIDGE_CONTAINER_ORIGIN,
} from "@worker/containers/imap-container";
import type { Env } from "@worker/types";

/**
 * IMAP middleware Eden treaty client。所有 `/api/*` 路由的 path / body / response
 * 都从 `@middleware/index` 自动推导。
 *
 * `throwHttpError: true` 让 Eden 在非 2xx 时直接抛 `EdenFetchError`（`extends Error`，
 * 带 `.status` / `.value`）。`reportErrorToObservability` 那一头识别这个 shape
 * 把 message 拼成可读形式；这里就用原版 treaty，不再单独包一层。
 */
export const bridgeClient = (env: Env) => {
  assertImapBridgeConfigured(env);
  return treaty<MiddlewareApp>(getBridgeOrigin(env), {
    fetcher: bridgeFetch(env),
    headers: { Authorization: `Bearer ${env.IMAP_BRIDGE_SECRET}` },
    throwHttpError: true,
  });
};

export const isImapBridgeConfigured = (env: Env): boolean =>
  Boolean(env.IMAP_BRIDGE_SECRET && env.IMAP_BRIDGE_CONTAINER);

type BridgeFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface RequestInitSource {
  body: Request["body"];
  headers: Request["headers"];
  method: Request["method"];
  redirect: Request["redirect"];
}

export const bridgeFetch = (env: Env): typeof fetch => {
  const fetcher: BridgeFetcher = async (input, init) => {
    assertImapBridgeConfigured(env);
    const request = toRequest(input, init);
    const container = env.IMAP_BRIDGE_CONTAINER;
    if (!container) throw new Error("IMAP bridge container not configured");
    return container
      .getByName(IMAP_BRIDGE_CONTAINER_NAME)
      .fetch(request.url, toRequestInit(request));
  };
  return fetcher as typeof fetch;
};

/**
 * 拆 treaty 的 success branch。`throwHttpError: true` 已保证非 2xx 抛错，
 * 运行时 `data` 一定非 null —— 这里仅把 TS 的 `T | null` 收紧成 `T`。
 */
export const bridgeCall = async <T>(
  p: Promise<{ data: T | null }>,
): Promise<NonNullable<T>> => {
  const { data } = await p;
  return data as NonNullable<T>;
};

/**
 * 检查 IMAP 中间件健康状态。
 * 返回 null 表示未配置 IMAP bridge（跳过检查）。
 * 抛出 / 5xx / 不可达 → 返回 ok: false 占位（health 探测吞错，避免拖累调用方）。
 */
export const checkImapBridgeHealth = async (
  env: Env,
): Promise<{ ok: boolean; total: number; usable: number } | null> => {
  if (!isImapBridgeConfigured(env)) return null;
  try {
    return await bridgeCall(bridgeClient(env).api.health.get());
  } catch {
    return { ok: false, total: 0, usable: 0 };
  }
};

/** 通知中间件重新拉取账号列表（账号增删后调用） */
export const syncAccounts = async (env: Env): Promise<void> => {
  await bridgeClient(env).api.sync.post();
};

const getBridgeOrigin = (_env: Env): string => IMAP_BRIDGE_CONTAINER_ORIGIN;

const assertImapBridgeConfigured = (env: Env): void => {
  if (!isImapBridgeConfigured(env)) {
    throw new Error(
      "IMAP bridge not configured (missing IMAP_BRIDGE_CONTAINER binding or IMAP_BRIDGE_SECRET)",
    );
  }
};

const toRequest = (input: RequestInfo | URL, init?: RequestInit): Request => {
  if (input instanceof Request) return new Request(input, init);
  return new Request(input.toString(), init);
};

const toRequestInit = (request: RequestInitSource): RequestInit => ({
  body: request.body,
  headers: request.headers,
  method: request.method,
  redirect: request.redirect,
});
