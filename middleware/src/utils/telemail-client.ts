import ky from "ky";
import { config } from "../config";

/** 与 Telemail Worker 中 accounts 表对应的 IMAP 账号信息 */
export interface ImapAccount {
  id: number;
  email: string;
  chat_id: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_user: string;
  imap_pass: string;
}

export type ImapFolderKind = "junk" | "trash" | "archive";

interface ImapLastUidState {
  value: number | null;
}

interface ImapFolderState {
  hit: boolean;
  path: string | null;
}

const api = ky.create({
  prefix: config.workerUrl,
  headers: { Authorization: `Bearer ${config.bridgeSecret}` },
  retry: { limit: 3, methods: ["get", "post"], backoffLimit: 5_000 },
  timeout: 60_000,
});

/** 从 Telemail Worker 拉取所有 IMAP 账号 */
export const fetchImapAccounts = (): Promise<ImapAccount[]> =>
  api.get("api/imap/accounts").json<ImapAccount[]>();

/** 通知 Telemail Worker 有新邮件到达（accountId + RFC 822 Message-Id），Worker 将入队后按需拉取原文 */
export const notifyNewEmail = (
  accountId: number,
  rfcMessageId: string,
): Promise<void> =>
  api
    .post("api/imap/push", { json: { accountId, rfcMessageId } })
    .then(() => {});

export const fetchImapLastUid = (
  accountId: number,
): Promise<ImapLastUidState> =>
  api.get(`api/imap/state/last-uid/${accountId}`).json<ImapLastUidState>();

export const putImapLastUid = (accountId: number, uid: number): Promise<void> =>
  api
    .put(`api/imap/state/last-uid/${accountId}`, { json: { uid } })
    .then(() => {});

export const fetchImapFolderState = (
  accountId: number,
  kind: ImapFolderKind,
): Promise<ImapFolderState> =>
  api.get(`api/imap/state/folder/${accountId}/${kind}`).json<ImapFolderState>();

export const putImapFolderState = (
  accountId: number,
  kind: ImapFolderKind,
  path: string | null,
): Promise<void> =>
  api
    .put(`api/imap/state/folder/${accountId}/${kind}`, { json: { path } })
    .then(() => {});

export const clearImapFolderState = (accountId: number): Promise<void> =>
  api.delete(`api/imap/state/folders/${accountId}`).then(() => {});
