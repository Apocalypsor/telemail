import { isAdmin } from "@worker/bot/utils/auth";
import { clearBotState } from "@worker/bot/utils/state";
import { t } from "@worker/i18n";
import { renewAllPush } from "@worker/providers";
import { type Env, QueueMessageType } from "@worker/types";
import { reportErrorToObservability } from "@worker/utils/observability";
import type { Bot } from "grammy";
import { registerFailedEmailCallbacks } from "./failed";
import { registerUserCallbacks } from "./users";
import {
  adminMenuKeyboard,
  buildSecretsText,
  SECRETS_AUTO_DELETE_SECONDS,
} from "./utils";

export const registerAdminHandlers = (bot: Bot, env: Env) => {
  // Secrets panel (admin only, hidden behind /start -> global ops)
  bot.callbackQuery("secrets", async (ctx) => {
    const userId = String(ctx.from.id);
    if (!isAdmin(userId, env)) {
      return ctx.answerCallbackQuery({ text: t("common:error.unauthorized") });
    }

    const sent = await ctx.reply(buildSecretsText(env), {
      parse_mode: "MarkdownV2",
    });
    await env.EMAIL_QUEUE.send(
      {
        type: QueueMessageType.DeleteTgMessage,
        chatId: String(sent.chat.id),
        messageId: sent.message_id,
      },
      { delaySeconds: SECRETS_AUTO_DELETE_SECONDS },
    );
    await ctx.answerCallbackQuery({
      text: t("admin:secrets.sent", { seconds: SECRETS_AUTO_DELETE_SECONDS }),
    });
  });

  // Admin operations menu
  bot.callbackQuery("admin", async (ctx) => {
    const userId = String(ctx.from.id);
    if (!isAdmin(userId, env)) {
      return ctx.answerCallbackQuery({ text: t("common:error.unauthorized") });
    }
    await clearBotState(env, userId);
    await ctx.editMessageText(t("admin:menu.title"), {
      reply_markup: await adminMenuKeyboard(env),
    });
    await ctx.answerCallbackQuery();
  });

  // Watch all
  bot.callbackQuery("walla", async (ctx) => {
    const userId = String(ctx.from.id);
    if (!isAdmin(userId, env)) {
      return ctx.answerCallbackQuery({ text: t("common:error.unauthorized") });
    }

    await ctx.answerCallbackQuery({ text: t("admin:watch.renewing") });
    try {
      await renewAllPush(env);
      await ctx.editMessageText(t("admin:watch.renewed"), {
        reply_markup: await adminMenuKeyboard(env),
      });
    } catch (err) {
      await reportErrorToObservability(env, "bot.watch_all_failed", err);
      await ctx.editMessageText(t("admin:watch.failed"), {
        reply_markup: await adminMenuKeyboard(env),
      });
    }
  });

  registerUserCallbacks(bot, env);
  registerFailedEmailCallbacks(bot, env);
};
