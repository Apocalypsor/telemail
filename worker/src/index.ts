import { app } from "@api";
import type { RequestWithCtx } from "@api/plugins/cf";
import { handleQueueBatch } from "@handlers/queue";
import { handleScheduled } from "@handlers/scheduled";
import type { Env, QueueMessage } from "@/types";

export type { App } from "@api";
export type { Env } from "@/types";

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
    await handleQueueBatch(batch, env, ctx);
  },

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(handleScheduled(event, env, ctx));
  },
};
