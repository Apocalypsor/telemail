import { t } from "elysia";

/** 共用的 path param `:provider` —— Gmail / Outlook 等 OAuth provider 的 slug。 */
export const OAuthParams = t.Object({ provider: t.String() });

/** Setup / start 页都接 `?account=<id>` —— 把要授权的账号 id 带进来。 */
export const OAuthAccountQuery = t.Object({
  account: t.Optional(t.String()),
});
