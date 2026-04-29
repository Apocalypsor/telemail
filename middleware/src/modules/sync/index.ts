import { connectionManager } from "@imap";
import { auth } from "@plugins/auth";
import { Elysia } from "elysia";

export const syncController = new Elysia({ name: "controller.sync" })
  .get("/health", ({ set }) => {
    const status = connectionManager.health();
    if (!status.ok) set.status = 503;
    return status;
  })

  .use(auth)

  .post("/sync", async () => {
    await connectionManager.sync();
    return { ok: true };
  })

  .get("/accounts", () => connectionManager.list());
