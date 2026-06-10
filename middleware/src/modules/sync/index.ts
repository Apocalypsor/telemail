import { connectionManager } from "@middleware/connections";
import { Elysia } from "elysia";

export const syncController = new Elysia({ name: "controller.sync" })
  .get("/health", ({ set }) => {
    const status = connectionManager.health();
    if (!status.ok) set.status = 503;
    return status;
  })

  .post("/sync", async () => {
    await connectionManager.sync();
    return { ok: true };
  })

  .get("/accounts", () => connectionManager.list());
