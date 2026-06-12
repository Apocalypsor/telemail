import { isAdmin } from "@worker/bot/utils/auth";
import { getUserByTelegramId, updateUserMcpApiKeyHash } from "@worker/db/users";
import { t } from "@worker/i18n";
import type { Env } from "@worker/types";
import { generateMcpApiKey, hashMcpApiKey } from "@worker/utils/mcp-api-key";
import { getWorkerBaseUrl } from "@worker/utils/url";
import type { Bot, CallbackQueryContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";

export const MCP_API_KEY_CALLBACK = "mcp_api_key";
const MCP_API_KEY_GENERATE_CALLBACK = "mcp_api_key_generate";

export const registerMcpApiKeyHandler = (bot: Bot, env: Env) => {
  bot.callbackQuery(MCP_API_KEY_CALLBACK, async (ctx) => {
    const user = await requireMcpUser(ctx, env);
    if (!user) return;

    await ctx.editMessageText(
      user.mcp_api_key_hash ? t("mcp:panelExisting") : t("mcp:panelEmpty"),
      { reply_markup: apiKeyKeyboard(!!user.mcp_api_key_hash) },
    );
    return ctx.answerCallbackQuery();
  });

  bot.callbackQuery(MCP_API_KEY_GENERATE_CALLBACK, async (ctx) => {
    const user = await requireMcpUser(ctx, env);
    if (!user) return;

    const apiKey = generateMcpApiKey();
    await updateUserMcpApiKeyHash(
      env.DB,
      user.telegram_id,
      await hashMcpApiKey(env.ADMIN_SECRET, apiKey),
    );

    await ctx.editMessageText(
      t("mcp:apiKeyGenerated", {
        endpoint: `${getWorkerBaseUrl(env)}/api/mcp`,
        apiKey,
      }),
      { reply_markup: apiKeyKeyboard(true) },
    );
    return ctx.answerCallbackQuery({ text: t("mcp:apiKeyGeneratedShort") });
  });
};

const requireMcpUser = async (ctx: CallbackQueryContext<Context>, env: Env) => {
  if (ctx.chat?.type !== "private") {
    await ctx.answerCallbackQuery({
      text: t("mcp:privateOnly"),
      show_alert: true,
    });
    return null;
  }

  const userId = String(ctx.from.id);
  const admin = isAdmin(userId, env);
  const user = await getUserByTelegramId(env.DB, userId);
  if (!user || (!admin && user.approved !== 1)) {
    await ctx.answerCallbackQuery({
      text: t("common:error.unauthorized"),
      show_alert: true,
    });
    return null;
  }

  return user;
};

const apiKeyKeyboard = (existing: boolean): InlineKeyboard => {
  return new InlineKeyboard()
    .text(
      existing ? t("mcp:regenerateButton") : t("mcp:generateButton"),
      MCP_API_KEY_GENERATE_CALLBACK,
    )
    .row()
    .text(t("common:button.back"), "menu");
};
