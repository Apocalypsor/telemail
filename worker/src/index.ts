import { app } from "@worker/api";
import type { RequestWithCtx } from "@worker/api/plugins/cf";
import queueHandler from "@worker/handlers/queue";
import scheduledHandler from "@worker/handlers/scheduled";
import type { Env, QueueMessage } from "@worker/types";

export { ContainerProxy } from "@cloudflare/containers";
export { ImapBridgeContainer } from "@worker/containers/imap-container";

export default {
  /**
   * 把 ExecutionContext 挂到 request 上，让 Elysia 的 `cf` plugin derive
   * 出来。env 走 `cloudflare:workers` 全局，不需要注入。
   */
  fetch(
    req: Request,
    _env: Env,
    ctx: ExecutionContext,
  ): Response | Promise<Response> {
    (req as RequestWithCtx)._ctx = ctx;
    return app.fetch(req);
  },

  async queue(
    batch: MessageBatch<QueueMessage>,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    await queueHandler(batch, env, ctx);
  },

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(scheduledHandler(event, env, ctx));
  },
};
