import { Readable } from "node:stream";
import { auth } from "@middleware/plugins/auth";
import { imap } from "@middleware/plugins/imap";
import { Elysia } from "elysia";
import {
  AccountBody,
  ArchiveBody,
  AttachmentBody,
  FetchBody,
  FlagBody,
  IsStarredBody,
  ListBody,
  ListFolderBody,
  LocateBody,
  SearchBody,
  UnarchiveBody,
} from "./model";

export const mailController = new Elysia({ name: "controller.mail" })
  .use(auth)
  .use(imap)

  .post(
    "/flag",
    async ({ body, imap }) => {
      const ok = await imap.setFlag(
        body.accountId,
        body.rfcMessageId,
        body.flag,
        body.add,
        body.folder,
        body.archiveFolder,
      );
      return { ok };
    },
    { body: FlagBody },
  )

  .post(
    "/fetch",
    async ({ body, imap }) => {
      const rawEmail = await imap.fetchEmail(
        body.accountId,
        body.rfcMessageId,
        body.folder,
        body.archiveFolder,
      );
      return { rawEmail };
    },
    { body: FetchBody },
  )

  .post(
    "/attachment",
    async ({ body, imap, status }) => {
      let attachment: Awaited<ReturnType<typeof imap.downloadAttachment>>;
      try {
        attachment = await imap.downloadAttachment(
          body.accountId,
          body.rfcMessageId,
          body.attachmentId,
          body.folder,
          body.archiveFolder,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.includes("not found") ||
          message.includes("invalid attachmentId")
        ) {
          return status(404, { error: "Attachment not found" });
        }
        throw err;
      }
      const headers = new Headers({
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "X-Attachment-Filename": encodeURIComponent(
          attachment.filename || "attachment",
        ),
      });
      return new Response(
        Readable.toWeb(
          attachment.content,
        ) as unknown as ReadableStream<Uint8Array>,
        { headers },
      );
    },
    { body: AttachmentBody },
  )

  .post(
    "/unread",
    async ({ body, imap }) => {
      const messages = await imap.listUnread(
        body.accountId,
        body.maxResults ?? 20,
        body.offset ?? 0,
      );
      return { messages };
    },
    { body: ListBody },
  )

  .post(
    "/unread-count",
    async ({ body, imap }) => {
      const count = await imap.countUnread(body.accountId);
      return { count };
    },
    { body: AccountBody },
  )

  .post(
    "/starred",
    async ({ body, imap }) => {
      const messages = await imap.listStarred(
        body.accountId,
        body.maxResults ?? 20,
        body.offset ?? 0,
      );
      return { messages };
    },
    { body: ListBody },
  )

  .post(
    "/is-starred",
    async ({ body, imap }) => {
      const starred = await imap.isStarred(
        body.accountId,
        body.rfcMessageId,
        body.folder,
        body.archiveFolder,
      );
      return { starred };
    },
    { body: IsStarredBody },
  )

  .post(
    "/list-folder",
    async ({ body, imap }) => {
      const messages = await imap.listFolder(
        body.accountId,
        body.folder,
        body.maxResults ?? 20,
        body.offset ?? 0,
      );
      return { messages };
    },
    { body: ListFolderBody },
  )

  .post(
    "/archive",
    async ({ body, imap }) => {
      await imap.archiveMessage(body.accountId, body.rfcMessageId, body.folder);
      return { ok: true };
    },
    { body: ArchiveBody },
  )

  .post(
    "/unarchive",
    async ({ body, imap }) => {
      await imap.unarchiveMessage(
        body.accountId,
        body.rfcMessageId,
        body.archiveFolder,
      );
      return { ok: true };
    },
    { body: UnarchiveBody },
  )

  .post(
    "/locate",
    async ({ body, imap }) => {
      return imap.locate(body.accountId, body.rfcMessageId, body.archiveFolder);
    },
    { body: LocateBody },
  )

  .post(
    "/search",
    async ({ body, imap }) => {
      const messages = await imap.searchMessages(
        body.accountId,
        body.query,
        body.maxResults ?? 20,
        body.offset ?? 0,
      );
      return { messages };
    },
    { body: SearchBody },
  )

  .post(
    "/mark-all-read",
    async ({ body, imap }) => imap.markAllAsRead(body.accountId),
    { body: AccountBody },
  );
