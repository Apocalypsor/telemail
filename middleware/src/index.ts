const _log = console.log;
const _err = console.error;
const ts = () => new Date().toISOString();
console.log = (...args: unknown[]) => _log(ts(), ...args);
console.error = (...args: unknown[]) => _err(ts(), ...args);

import { Elysia } from "elysia";
import { config } from "./config";
import { junkController } from "./modules/junk/index";
import { mailController } from "./modules/mail/index";
import { syncController } from "./modules/sync/index";
import { connectionManager } from "./utils/imap-connection";

const app = new Elysia({ prefix: "/api" })
  .onError(({ error }) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(msg);
    return { ok: false, error: msg };
  })
  .use(syncController)
  .use(mailController)
  .use(junkController);

const main = async (): Promise<void> => {
  console.log("[Telemail Middleware] Starting...");

  app.listen(config.port, () => {
    console.log(`[Server] Listening on port ${config.port}`);
  });

  try {
    await connectionManager.sync();
  } catch (err: unknown) {
    console.error("[Startup] Failed to sync accounts:", err);
    console.error("[Startup] Will retry on next POST /sync call.");
  }

  process.on("SIGTERM", () => {
    console.log("[Telemail Middleware] Shutting down...");
    process.exit(0);
  });
};

main().catch((err) => {
  console.error("[Fatal]", err);
  process.exit(1);
});
