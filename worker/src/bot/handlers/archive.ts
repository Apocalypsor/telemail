import { buildEmailKeyboard } from "@worker/bot/keyboards";
import { resolveMessageAccount } from "@worker/bot/utils/message-context";
import { readStarredFromReplyMarkup } from "@worker/bot/utils/reply-markup";
import { t } from "@worker/i18n";
import { accountCanArchive } from "@worker/providers";
import type { Env } from "@worker/types";
import { archiveEmailAndCleanup } from "@worker/utils/message-actions";
import { reportErrorToObservability } from "@worker/utils/observability";
import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";

/** 归档 inline button callback，两步确认后才执行归档。 */
export const registerArchiveHandler = (bot: Bot, env: Env) => {
  bot.callbackQuery("archive", async (ctx) => {
    const msg = ctx.callbackQuery.message;
    if (!msg) return;
    const resolved = await resolveMessageAccount(
      env,
      String(msg.chat.id),
      msg.message_id,
    );
    if (!resolved.ok) {
      await ctx.answerCallbackQuery({ text: resolved.error });
      return;
    }
    if (!accountCanArchive(resolved.account)) {
      await ctx.answerCallbackQuery({
        text: t("archive:gmailUnconfigured"),
        show_alert: true,
      });
      return;
    }
    const starred = readStarredFromReplyMarkup(msg.reply_markup);
    const kb = new InlineKeyboard()
      .text(t("archive:confirm"), "archive_confirm")
      .text(t("common:button.cancel"), `archive_cancel:${starred ? "1" : "0"}`);
    await ctx.editMessageReplyMarkup({ reply_markup: kb });
    await ctx.answerCallbackQuery({ text: t("archive:confirmPrompt") });
  });

  bot.callbackQuery("archive_confirm", async (ctx) => {
    const msg = ctx.callbackQuery.message;
    if (!msg) return;

    try {
      const chatId = String(msg.chat.id);
      const resolved = await resolveMessageAccount(env, chatId, msg.message_id);
      if (!resolved.ok) {
        await ctx.answerCallbackQuery({ text: resolved.error });
        return;
      }
      const { mapping, account } = resolved;

      if (!accountCanArchive(account)) {
        await ctx.answerCallbackQuery({
          text: t("archive:gmailUnconfigured"),
          show_alert: true,
        });
        return;
      }

      await archiveEmailAndCleanup(env, account, mapping.email_message_id);

      await ctx.answerCallbackQuery({ text: t("archive:archived") });
      console.log(`Archived: email=${mapping.email_message_id}`);
    } catch (err) {
      await reportErrorToObservability(env, "bot.archive_failed", err);
      await ctx.answerCallbackQuery({
        text: t("common:error.operationFailed"),
      });
    }
  });

  bot.callbackQuery(/^archive_cancel:(0|1)$/, async (ctx) => {
    const msg = ctx.callbackQuery.message;
    if (!msg) return;
    try {
      const starred = ctx.match[1] === "1";
      const chatId = String(msg.chat.id);
      const resolved = await resolveMessageAccount(env, chatId, msg.message_id);
      if (!resolved.ok) {
        await ctx.answerCallbackQuery({ text: resolved.error });
        return;
      }
      const { mapping, account } = resolved;
      const keyboard = await buildEmailKeyboard(
        env,
        mapping.email_message_id,
        account.id,
        starred,
        accountCanArchive(account),
        mapping.tg_chat_id,
        mapping.tg_message_id,
      );
      await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      await ctx.answerCallbackQuery();
    } catch (err) {
      await reportErrorToObservability(env, "bot.archive_cancel_failed", err);
      await ctx.answerCallbackQuery({
        text: t("common:error.operationFailed"),
      });
    }
  });
};
