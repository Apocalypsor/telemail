import { t } from "elysia";

/** Push payloads 都是外部服务（Pub/Sub / Graph）发的，
 *  各自结构由 provider class 的 `enqueue` 静态方法解析；这里只走 unknown 透传。 */
export const PushBody = t.Unknown();

/** Outlook Graph subscription：先处理 `?validationToken=` 握手，再校验 `?secret=`。 */
export const OutlookPushQuery = t.Object({
  validationToken: t.Optional(t.String()),
  secret: t.Optional(t.String()),
});

export const ImapPushBody = t.Object({
  accountId: t.Number(),
  rfcMessageId: t.String(),
});

export const ImapAccountParams = t.Object({
  accountId: t.String(),
});

export const ImapFolderParams = t.Object({
  accountId: t.String(),
  kind: t.Union([t.Literal("junk"), t.Literal("trash"), t.Literal("archive")]),
});

export const ImapLastUidBody = t.Object({
  uid: t.Number(),
});

export const ImapFolderBody = t.Object({
  path: t.Union([t.String(), t.Null()]),
});
