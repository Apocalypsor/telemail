import { t } from "elysia";

/** GET /api/mail/:id query (token auth via `t`, optional folder hint). */
export const MailGetQuery = t.Object({
  accountId: t.String(),
  t: t.String(),
  folder: t.Optional(
    t.Union([t.Literal("inbox"), t.Literal("junk"), t.Literal("archive")]),
  ),
});

/** Common path param `:id` (RFC 822 Message-Id / Gmail msg id / Outlook id). */
export const MailParams = t.Object({ id: t.String() });

/** Mutations 共用三件套：accountId + token —— 鉴权 + 权限校验。 */
export const MailActionBody = t.Object({
  accountId: t.Number(),
  token: t.String(),
});
export type MailActionBody = typeof MailActionBody.static;

/** Toggle star 在三件套之上多一个 starred。 */
export const MailToggleStarBody = t.Composite([
  MailActionBody,
  t.Object({ starred: t.Boolean() }),
]);
export type MailToggleStarBody = typeof MailToggleStarBody.static;

const MailMetaResponse = t.Object({
  subject: t.Optional(t.Union([t.String(), t.Null()])),
  from: t.Optional(t.Union([t.String(), t.Null()])),
  to: t.Optional(t.Union([t.String(), t.Null()])),
  date: t.Optional(t.Union([t.String(), t.Null()])),
});

/** GET /api/mail/:id 响应。 */
export const MailGetResponse = t.Object({
  meta: MailMetaResponse,
  accountEmail: t.Union([t.String(), t.Null()]),
  bodyHtml: t.String(),
  bodyHtmlRaw: t.String(),
  inJunk: t.Boolean(),
  inArchive: t.Boolean(),
  starred: t.Boolean(),
  canArchive: t.Boolean(),
  webMailUrl: t.String(),
  tgMessageLink: t.Union([t.String(), t.Null()]),
});
export type MailGetResponse = typeof MailGetResponse.static;

/** POST mutations 响应：`{ ok, message?, starred? }`。 */
export const MailMutationResponse = t.Object({
  ok: t.Boolean(),
  message: t.Optional(t.String()),
  starred: t.Optional(t.Boolean()),
});

/** 错误响应 `{ ok:false, error }`。 */
export const MailErrorResponse = t.Object({
  ok: t.Literal(false),
  error: t.String(),
});

/** GET 错误响应 `{ error }`（GET 不带 `ok` 字段）。 */
export const MailGetErrorResponse = t.Object({
  error: t.String(),
});
