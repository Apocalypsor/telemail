import { t } from "elysia";

/** Telegram webhook update —— grammY 内部解析为 `Update`，这里走 unknown 透传。 */
export const WebhookBody = t.Unknown();

/** `?secret=` 共享密钥，校验 webhook 来源。 */
export const WebhookQuery = t.Object({
  secret: t.Optional(t.String()),
});
