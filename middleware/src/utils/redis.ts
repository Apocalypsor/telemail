import { createClient } from "redis";
import { config } from "../config";

const LAST_UID_PREFIX = "telemail:lastUid:";
const FOLDER_PREFIX = "telemail:folder:";
/** 特殊 folder 路径在账号生命周期里基本不变（specialUse 是 IMAP server 出厂配置）。
 *  24h 失效是兜底——账号 stop / config 变更时主动清掉，正常情况这缓存命中率近 100%。 */
const FOLDER_TTL_SECONDS = 24 * 60 * 60;

let redis: ReturnType<typeof createClient> | null = null;

if (config.redisUrl) {
  redis = createClient({ url: config.redisUrl });
  redis.on("error", (err) => {
    console.error("[Redis] Error:", err.message);
  });
  redis.on("ready", () => {
    console.log("[Redis] Connected");
  });
  redis.connect().catch(() => {});
}

export const getLastUid = async (accountId: number): Promise<number | null> => {
  if (!redis?.isReady) return null;
  try {
    const val = await redis.get(`${LAST_UID_PREFIX}${accountId}`);
    return val ? Number.parseInt(val, 10) : null;
  } catch {
    return null;
  }
};

export const setLastUid = async (
  accountId: number,
  uid: number,
): Promise<void> => {
  if (!redis?.isReady) return;
  try {
    await redis.set(`${LAST_UID_PREFIX}${accountId}`, uid.toString());
  } catch {}
};

export type FolderKind = "junk" | "trash" | "archive";

/**
 * 三态返回：
 *  - `string` : 命中缓存，是这个 folder 的 path
 *  - `null`   : 命中缓存且服务器上确实没有这种 folder（避免每次重新探测）
 *  - `undefined` : 未命中（Redis 不可达或 key 不存在），调用方需要现场探测
 */
export const getCachedFolderPath = async (
  accountId: number,
  kind: FolderKind,
): Promise<string | null | undefined> => {
  if (!redis?.isReady) return undefined;
  try {
    const val = await redis.get(`${FOLDER_PREFIX}${accountId}:${kind}`);
    if (val === null) return undefined;
    return val === "" ? null : val;
  } catch {
    return undefined;
  }
};

/** `path === null` 显式缓存"没找到"——空字符串当哨兵（folder path 不会是空串）。 */
export const setCachedFolderPath = async (
  accountId: number,
  kind: FolderKind,
  path: string | null,
): Promise<void> => {
  if (!redis?.isReady) return;
  try {
    await redis.set(`${FOLDER_PREFIX}${accountId}:${kind}`, path ?? "", {
      EX: FOLDER_TTL_SECONDS,
    });
  } catch {}
};

/** 账号 stop / 配置变更 / 删除时调，强制下次重新探测 folder 结构。 */
export const clearCachedFolders = async (accountId: number): Promise<void> => {
  if (!redis?.isReady) return;
  try {
    await Promise.all(
      (["junk", "trash", "archive"] as const).map((kind) =>
        redis?.del(`${FOLDER_PREFIX}${accountId}:${kind}`),
      ),
    );
  } catch {}
};
