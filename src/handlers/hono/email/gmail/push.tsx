import { requireSecret } from "@handlers/hono/middleware";
import { ROUTE_GMAIL_PUSH } from "@handlers/hono/routes";
import { enqueueSyncNotification } from "@services/email/gmail/sync";
import { Hono } from "hono";
import type { AppEnv, PubSubPushBody } from "@/types";

const gmailPush = new Hono<AppEnv>();

gmailPush.post(
  ROUTE_GMAIL_PUSH,
  requireSecret("GMAIL_PUSH_SECRET"),
  async (c) => {
    const body = await c.req.json<PubSubPushBody>();
    await enqueueSyncNotification(body, c.env);
    return c.text("OK");
  },
);

export default gmailPush;
