import { t } from "elysia";

/** GET /api/login/callback —— Telegram Login Widget 回调时挂在 query 上的字段。
 *  全部 optional：缺哪个就 400，由 handler 自己校验（widget 会传完整一组）。 */
export const LoginCallbackQuery = t.Object({
  id: t.Optional(t.String()),
  first_name: t.Optional(t.String()),
  last_name: t.Optional(t.String()),
  username: t.Optional(t.String()),
  photo_url: t.Optional(t.String()),
  auth_date: t.Optional(t.String()),
  hash: t.Optional(t.String()),
  return_to: t.Optional(t.String()),
});

/** GET /api/session/whoami 200 响应 —— 已登录用户的最小可见信息。 */
export const WhoamiResponse = t.Object({
  telegramId: t.String(),
  isAdmin: t.Boolean(),
  firstName: t.String(),
  username: t.Union([t.String(), t.Null()]),
});
export type WhoamiResponse = typeof WhoamiResponse.static;

/** GET /api/public/bot-info 200 响应 —— 登录页拉 bot username。 */
export const BotInfoResponse = t.Object({
  botUsername: t.String(),
});
export type BotInfoResponse = typeof BotInfoResponse.static;

/** Generic `{ ok: true }`。 */
export const OkResponse = t.Object({
  ok: t.Literal(true),
});

/** Generic `{ error }`。 */
export const ErrorResponse = t.Object({
  error: t.String(),
});
