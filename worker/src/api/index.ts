import { authController } from "@worker/api/modules/auth";
import { mailController } from "@worker/api/modules/mail";
import { miniAppController } from "@worker/api/modules/miniapp";
import { oauthController } from "@worker/api/modules/oauth";
import { previewController } from "@worker/api/modules/preview";
import { providersController } from "@worker/api/modules/providers";
import { remindersController } from "@worker/api/modules/reminders";
import { telegramController } from "@worker/api/modules/telegram";
import { reportErrorToObservability } from "@worker/utils/observability";
import { Elysia } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";

/**
 * Worker HTTP entry —— Elysia app composing all controllers.
 *
 * 路径分布：
 *  - `/api/telegram/webhook`           bot webhook
 *  - `/api/{gmail,outlook,imap}/*`     provider push handlers
 *  - `/api/session/*`, `/api/login/*`, `/api/public/*`  auth
 *  - `/oauth/:provider/*`              OAuth flow HTML pages
 *  - `/api/preview`, `/api/junk-check` LLM tools
 *  - `/api/cors-proxy`                 mail body image proxy
 *  - `/api/mail/:id` + 6 mutations     mail preview + actions
 *  - `/api/mini-app/*`                 mini app generic API
 *  - `/api/reminders/*`                reminders CRUD
 *
 * 通过 `worker/index.ts` 的 fetch wrapper 把 (env, executionCtx) 注入。
 */
export const app = new Elysia({ adapter: CloudflareAdapter, name: "telemail" })
  .onError(async ({ error, request }) => {
    await reportErrorToObservability(
      // env via cloudflare:workers global; reportErrorToObservability still
      // takes Env as first arg, but we only use it for binding lookup. Avoid
      // circular import by re-importing locally.
      (await import("cloudflare:workers")).env as never,
      "http.unhandled_error",
      error,
      {
        method: request.method,
        pathname: new URL(request.url).pathname,
      },
    );
    return new Response("Internal Server Error", { status: 500 });
  })
  .use(authController)
  .use(telegramController)
  .use(providersController)
  .use(oauthController)
  .use(previewController)
  .use(mailController)
  .use(miniAppController)
  .use(remindersController)
  .compile();

export type App = typeof app;
