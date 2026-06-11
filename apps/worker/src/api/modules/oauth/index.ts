import { html } from "@elysiajs/html";
import { cf } from "@worker/api/plugins/cf";
import { getAccountById } from "@worker/db/accounts";
import { Elysia } from "elysia";
import {
  OAuthCallbackPage,
  OAuthErrorPage,
  OAuthSetupPage,
} from "./components";
import { OAuthAccountQuery, OAuthParams } from "./model";
import { resolveOAuth } from "./utils";

/**
 * OAuth flow 三个 HTML 页：
 *  - GET /oauth/:provider          说明 + redirect URI 提示页
 *  - GET /oauth/:provider/start    302 到 Google/MS authorize 页
 * - GET /oauth/:provider/callback OAuth 回调，写 refresh_token，渲染成功页
 *
 * `./components` 里渲染函数已经直接调 `Html.createElement` 输出 HTML 字符串，
 * 不走 JSX 语法 —— page 那边 tsconfig 的 jsx 设置和 worker 这里的 jsxFactory
 * 是冲突的，纯函数调用的写法跨包共享类型不会撞。
 */
export const oauthController = new Elysia({ name: "controller.oauth" })
  .use(html())
  .use(cf)

  .get(
    "/oauth/:provider",
    async ({ env, params, query, request, status }) => {
      const oauth = resolveOAuth(params.provider);
      if (!oauth) return status(404, "Unknown OAuth provider");

      const accountId = parseInt(query.account || "0", 10);
      if (Number.isNaN(accountId) || accountId <= 0)
        return status(400, "Invalid account ID");
      const account = await getAccountById(env.DB, accountId);
      if (!account) return status(404, "Account not found");

      const url = new URL(request.url);
      const startUrl = new URL(`${url.pathname}/start`, url.origin);
      startUrl.searchParams.set("account", String(account.id));
      const callbackUrl = `${url.origin}${url.pathname}/callback`;

      return OAuthSetupPage({
        startUrl: startUrl.toString(),
        callbackUrl,
        accountEmail: account.email || `Account #${account.id}`,
      });
    },
    { params: OAuthParams, query: OAuthAccountQuery },
  )

  .get(
    "/oauth/:provider/start",
    async ({ env, params, query, request, status }) => {
      const oauth = resolveOAuth(params.provider);
      if (!oauth) return status(404, "Unknown OAuth provider");

      const accountId = parseInt(query.account || "0", 10);
      if (Number.isNaN(accountId) || accountId <= 0)
        return status(400, "Invalid account ID");
      const account = await getAccountById(env.DB, accountId);
      if (!account) return status(404, "Account not found");

      return oauth.startOAuth(request, env, account.id);
    },
    { params: OAuthParams, query: OAuthAccountQuery },
  )

  .get(
    "/oauth/:provider/callback",
    async ({ env, params, request, status, set }) => {
      const oauth = resolveOAuth(params.provider);
      if (!oauth) return status(404, "Unknown OAuth provider");

      const result = await oauth.processOAuthCallback(request, env);
      if (!result.ok) {
        set.status = result.status;
        return OAuthErrorPage({ title: result.title, detail: result.detail });
      }

      return OAuthCallbackPage({
        refreshToken: result.refreshToken,
        scope: result.scope,
        expiresIn: result.expiresIn,
        accountEmail: result.accountEmail,
      });
    },
    { params: OAuthParams },
  );
