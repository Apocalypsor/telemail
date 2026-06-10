import { cf } from "@worker/api/plugins/cf";
import {
  requireGmailPushSecret,
  requireImapBridgeBearer,
} from "@worker/api/plugins/secrets";
import { getImapAccounts } from "@worker/db/accounts";
import {
  deleteImapBridgeFolderPaths,
  getImapBridgeFolderPath,
  getImapBridgeLastUid,
  putImapBridgeFolderPath,
  putImapBridgeLastUid,
} from "@worker/db/kv";
import { GmailProvider } from "@worker/providers/gmail";
import { ImapProvider } from "@worker/providers/imap";
import { OutlookProvider } from "@worker/providers/outlook";
import { timingSafeEqual } from "@worker/utils/hash";
import { Elysia } from "elysia";
import {
  ImapAccountParams,
  ImapFolderBody,
  ImapFolderParams,
  ImapLastUidBody,
  ImapPushBody,
  OutlookPushQuery,
  PushBody,
} from "./model";
import { parseAccountId } from "./utils";

/**
 * Provider push webhooks。
 *  - Gmail: Pub/Sub push（query `?secret=GMAIL_PUSH_SECRET`）
 *  - Outlook: Graph subscription（先处理 `?validationToken=` 握手，再 secret）
 *  - IMAP: VPS bridge 通过 Bearer 拉账号、推新邮件、读写 KV-backed state
 *
 * 走的都是各 provider class 的 `enqueue` 静态方法，把消息丢进 Queue 后立即 200。
 */

const gmailPush = new Elysia({ name: "gmail-push" })
  .use(requireGmailPushSecret)
  .post(
    "/api/gmail/push",
    async ({ env, body }) => {
      await GmailProvider.enqueue(body as { message: { data: string } }, env);
      return "OK";
    },
    { body: PushBody },
  );

const outlookPush = new Elysia({ name: "outlook-push" }).use(cf).post(
  "/api/outlook/push",
  async ({ env, query, body, status }) => {
    // Graph subscription validation 握手 —— 必须早于鉴权
    const validationToken = query.validationToken;
    if (validationToken) {
      return new Response(validationToken, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const provided = query.secret;
    if (
      typeof provided !== "string" ||
      !env.MS_WEBHOOK_SECRET ||
      !timingSafeEqual(provided, env.MS_WEBHOOK_SECRET)
    ) {
      return status(403, "Forbidden");
    }

    await OutlookProvider.enqueue(
      body as Parameters<typeof OutlookProvider.enqueue>[0],
      env,
    );
    return "OK";
  },
  { body: PushBody, query: OutlookPushQuery },
);

const imapBridge = new Elysia({ name: "imap-bridge" })
  .use(requireImapBridgeBearer)
  .get("/api/imap/accounts", async ({ env }) => {
    const accounts = await getImapAccounts(env.DB);
    return accounts.map((acc) => ({
      id: acc.id,
      email: acc.email,
      chat_id: acc.chat_id,
      imap_host: acc.imap_host,
      imap_port: acc.imap_port,
      imap_secure: !!acc.imap_secure,
      imap_user: acc.imap_user,
      imap_pass: acc.imap_pass,
    }));
  })
  .post(
    "/api/imap/push",
    async ({ env, body }) => {
      await ImapProvider.enqueue(body, env);
      return "OK";
    },
    { body: ImapPushBody },
  )
  .get(
    "/api/imap/state/last-uid/:accountId",
    async ({ env, params, status }) => {
      const accountId = parseAccountId(params.accountId);
      if (!accountId) return status(400, { error: "Bad Request" });
      const value = await getImapBridgeLastUid(env.EMAIL_KV, accountId);
      return { value };
    },
    { params: ImapAccountParams },
  )
  .put(
    "/api/imap/state/last-uid/:accountId",
    async ({ env, params, body, status }) => {
      const accountId = parseAccountId(params.accountId);
      if (!accountId) return status(400, { error: "Bad Request" });
      await putImapBridgeLastUid(env.EMAIL_KV, accountId, body.uid);
      return "OK";
    },
    { params: ImapAccountParams, body: ImapLastUidBody },
  )
  .get(
    "/api/imap/state/folder/:accountId/:kind",
    async ({ env, params, status }) => {
      const accountId = parseAccountId(params.accountId);
      if (!accountId) return status(400, { error: "Bad Request" });
      return getImapBridgeFolderPath(env.EMAIL_KV, accountId, params.kind);
    },
    { params: ImapFolderParams },
  )
  .put(
    "/api/imap/state/folder/:accountId/:kind",
    async ({ env, params, body, status }) => {
      const accountId = parseAccountId(params.accountId);
      if (!accountId) return status(400, { error: "Bad Request" });
      await putImapBridgeFolderPath(
        env.EMAIL_KV,
        accountId,
        params.kind,
        body.path,
      );
      return "OK";
    },
    { params: ImapFolderParams, body: ImapFolderBody },
  )
  .delete(
    "/api/imap/state/folders/:accountId",
    async ({ env, params, status }) => {
      const accountId = parseAccountId(params.accountId);
      if (!accountId) return status(400, { error: "Bad Request" });
      await deleteImapBridgeFolderPaths(env.EMAIL_KV, accountId);
      return "OK";
    },
    { params: ImapAccountParams },
  );

export const providersController = new Elysia({ name: "controller.providers" })
  .use(gmailPush)
  .use(outlookPush)
  .use(imapBridge);
