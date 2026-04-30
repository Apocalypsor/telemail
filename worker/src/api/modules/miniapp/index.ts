import { authMiniApp } from "@api/plugins/auth-miniapp";
import { cf } from "@api/plugins/cf";
import { getCachedMailList, putCachedMailList } from "@db/kv";
import { getMailList, isMailListType, searchMail } from "@utils/mail-list";
import { markAllAsRead, trashAllJunkEmails } from "@utils/message-actions";
import { Elysia, t } from "elysia";

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
    async ({ env, executionCtx, userId, params, query, status }) => {
      const type = params.type;
      if (!isMailListType(type))
        return status(400, { error: "Unknown list type" });

      const useCache = query.cache === "true";
      if (useCache) {
        const cached = await getCachedMailList(env.EMAIL_KV, userId, type);
        if (cached)
          return new Response(cached, {
            status: 200,
            headers: { "content-type": "application/json" },
          });
      }

      const result = await getMailList(env, userId, type);
      if (result.pendingSideEffects.length > 0) {
        executionCtx.waitUntil(
          Promise.allSettled(result.pendingSideEffects.map((t) => t())),
        );
      }
      const json = JSON.stringify({
        type: result.type,
        results: result.results,
        total: result.total,
      });
      executionCtx.waitUntil(
        putCachedMailList(env.EMAIL_KV, userId, type, json).catch(() => {}),
      );
      return new Response(json, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    {
      params: t.Object({ type: t.String() }),
      query: t.Object({ cache: t.Optional(t.String()) }),
    },
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
      return await searchMail(env, userId, q);
    },
    { query: t.Object({ q: t.Optional(t.String()) }) },
  );
