import { timingSafeEqual } from "@worker/utils/hash";
import { Elysia } from "elysia";
import { cf } from "./cf";

/** Gmail Pub/Sub push: query `?secret=` 共享密钥校验。 */
export const requireGmailPushSecret = new Elysia({
  name: "require-gmail-push-secret",
})
  .use(cf)
  .derive({ as: "scoped" }, ({ env, query, status }) => {
    const provided = query.secret;
    if (
      typeof provided !== "string" ||
      !timingSafeEqual(provided, env.GMAIL_PUSH_SECRET)
    ) {
      return status(403, "Forbidden");
    }
    return {};
  });

/** IMAP bridge: Bearer 共享密钥校验。 */
export const requireImapBridgeBearer = new Elysia({
  name: "require-imap-bridge-bearer",
})
  .use(cf)
  .derive({ as: "scoped" }, ({ env, headers, status }) => {
    const header = headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (
      !env.IMAP_BRIDGE_SECRET ||
      !timingSafeEqual(token, env.IMAP_BRIDGE_SECRET)
    ) {
      return status(401, { error: "Unauthorized" });
    }
    return {};
  });
