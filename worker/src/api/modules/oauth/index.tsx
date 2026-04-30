import { cf } from "@api/plugins/cf";
import {
  accountDetailKeyboard,
  accountDetailText,
} from "@bot/utils/formatters";
import { getAccountById } from "@db/accounts";
import { deleteOAuthBotMsg, getOAuthBotMsg } from "@db/kv";
import { Html, html } from "@elysiajs/html";
import { Elysia } from "elysia";
import { Api } from "grammy";
import {
  OAuthCallbackPage,
  OAuthErrorPage,
  OAuthSetupPage,
} from "./components";
import { OAuthAccountQuery, OAuthParams } from "./model";
import { resolveOAuth } from "./utils";

// `Html` 必须在 scope —— jsxFactory 编译成 `Html.createElement(...)`。
void Html;

/**
 * OAuth flow 三个 HTML 页：
 *  - GET /oauth/:provider          说明 + redirect URI 提示页
 *  - GET /oauth/:provider/start    302 到 Google/MS authorize 页
 *  - GET /oauth/:provider/callback OAuth 回调，写 refresh_token，编辑 bot 消息，渲染成功页
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

      return (
        <OAuthSetupPage
          startUrl={startUrl.toString()}
          callbackUrl={callbackUrl}
          accountEmail={account.email || `Account #${account.id}`}
        />
      );
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
        return <OAuthErrorPage title={result.title} detail={result.detail} />;
      }

      // 尝试更新 bot 中的授权消息（best-effort）
      const botMsg = await getOAuthBotMsg(env.EMAIL_KV, result.accountId);
      if (botMsg) {
        try {
          const account = await getAccountById(env.DB, result.accountId);
          if (account) {
            const api = new Api(env.TELEGRAM_BOT_TOKEN);
            await api.editMessageText(
              botMsg.chatId,
              botMsg.messageId,
              accountDetailText(account),
              { reply_markup: accountDetailKeyboard(account) },
            );
          }
        } catch {
          /* ignore: don't break OAuth success page */
        }
        await deleteOAuthBotMsg(env.EMAIL_KV, result.accountId);
      }

      return (
        <OAuthCallbackPage
          refreshToken={result.refreshToken}
          scope={result.scope}
          expiresIn={result.expiresIn}
          accountEmail={result.accountEmail}
        />
      );
    },
    { params: OAuthParams },
  );
