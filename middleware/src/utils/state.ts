import {
  clearImapFolderState,
  fetchImapFolderState,
  fetchImapLastUid,
  putImapFolderState,
  putImapLastUid,
} from "@middleware/utils/telemail-client";

export type FolderKind = "junk" | "trash" | "archive";

export const getLastUid = async (accountId: number): Promise<number | null> => {
  try {
    return (await fetchImapLastUid(accountId)).value;
  } catch {
    return null;
  }
};

export const setLastUid = async (
  accountId: number,
  uid: number,
): Promise<void> => {
  try {
    await putImapLastUid(accountId, uid);
  } catch {}
};

/**
 * 三态返回：
 *  - `string` : 命中缓存，是这个 folder 的 path
 *  - `null`   : 命中缓存且服务器上确实没有这种 folder（避免每次重新探测）
 *  - `undefined` : 未命中或 Worker KV 暂不可达，调用方需要现场探测
 */
export const getCachedFolderPath = async (
  accountId: number,
  kind: FolderKind,
): Promise<string | null | undefined> => {
  try {
    const state = await fetchImapFolderState(accountId, kind);
    return state.hit ? state.path : undefined;
  } catch {
    return undefined;
  }
};

/** `path === null` 显式缓存"没找到"。 */
export const setCachedFolderPath = async (
  accountId: number,
  kind: FolderKind,
  path: string | null,
): Promise<void> => {
  try {
    await putImapFolderState(accountId, kind, path);
  } catch {}
};

/** 账号 stop / 配置变更 / 删除时调，强制下次重新探测 folder 结构。 */
export const clearCachedFolders = async (accountId: number): Promise<void> => {
  try {
    await clearImapFolderState(accountId);
  } catch {}
};
