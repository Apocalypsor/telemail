import { authMiniApp } from "@worker/api/plugins/auth-miniapp";
import { cf } from "@worker/api/plugins/cf";
import {
  markAllAsRead,
  trashAllJunkEmails,
} from "@worker/utils/message-actions/actions";
import { Elysia } from "elysia";
import { ListParams, SearchQuery } from "./model";
import { MiniappService } from "./service";
import { isMailListType } from "./utils";

/**
 * Mini App 通用 API:
 *  - GET  /api/mini-app/list/:type      list (unread/starred/junk/archived)
 *  - POST /api/mini-app/mark-all-as-read
 *  - POST /api/mini-app/trash-all-junk
 *  - GET  /api/mini-app/search?q=...
 *
 * 鉴权统一走 X-Telegram-Init-Data（authMiniApp）。
 */
export const miniAppController = new Elysia({ name: "controller.miniapp" })
  .use(cf)
  .use(authMiniApp)

  .get(
    "/api/mini-app/list/:type",
    async ({ env, executionCtx, userId, params, status }) => {
      const type = params.type;
      if (!isMailListType(type))
        return status(400, { error: "Unknown list type" });

      const result = await MiniappService.getMailList(env, userId, type);
      if (result.pendingSideEffects.length > 0) {
        executionCtx.waitUntil(
          Promise.allSettled(result.pendingSideEffects.map((t) => t())),
        );
      }
      return {
        type: result.type,
        results: result.results,
        total: result.total,
      };
    },
    { params: ListParams },
  )

  .post("/api/mini-app/mark-all-as-read", async ({ env, userId }) => {
    return await markAllAsRead(env, userId);
  })

  .post("/api/mini-app/trash-all-junk", async ({ env, userId }) => {
    return await trashAllJunkEmails(env, userId);
  })

  .get(
    "/api/mini-app/search",
    async ({ env, userId, query, status }) => {
      const q = (query.q ?? "").trim();
      if (!q) return status(400, { error: "缺少搜索关键词" });
      if (q.length > 200) return status(400, { error: "关键词过长" });
      return await MiniappService.searchMail(env, userId, q);
    },
    { query: SearchQuery },
  );
