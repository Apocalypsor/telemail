import { resolveStarredKeyboard } from "@bot/keyboards";
import { resolveMessageAccount } from "@bot/utils/message-context";
import { deleteMappingByEmailId } from "@db/message-map";
import { t } from "@i18n";
import { getEmailProvider } from "@providers";
import { deleteMessage } from "@services/telegram";
import { reportErrorToObservability } from "@utils/observability";
import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { Env } from "@/types";

/**
 * 标记为垃圾邮件 inline button，两步确认：
 *  - `junk_mark`    用户点 🚫 → 改成 [⚠️ 确认] [❌ 取消]
 *  - `junk_confirm` 点确认 → 真的标记为垃圾、删 TG 消息 + mapping
 *  - `junk_cancel`  点取消 → 恢复原来的邮件键盘
 */
export function registerJunkHandler(bot: Bot, env: Env) {
  bot.callbackQuery("junk_mark", async (ctx) => {
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
    const kb = new InlineKeyboard()
      .text(t("junk:confirm"), "junk_confirm")
      .text(t("common:button.cancel"), "junk_cancel");
    await ctx.editMessageReplyMarkup({ reply_markup: kb });
    await ctx.answerCallbackQuery({ text: t("junk:confirmPrompt") });
  });

  bot.callbackQuery("junk_confirm", async (ctx) => {
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

      const provider = getEmailProvider(account, env);
      await provider.markAsJunk(mapping.email_message_id);

      await deleteMessage(env.TELEGRAM_BOT_TOKEN, chatId, msg.message_id).catch(
        () => {},
      );
      await deleteMappingByEmailId(
        env.DB,
        mapping.email_message_id,
        mapping.account_id,
      ).catch(() => {});

      await ctx.answerCallbackQuery({ text: t("junk:markedAsJunk") });
      console.log(`Marked as junk: email=${mapping.email_message_id}`);
    } catch (err) {
      await reportErrorToObservability(env, "bot.junk_mark_failed", err);
      await ctx.answerCallbackQuery({
        text: t("common:error.operationFailed"),
      });
    }
  });

  bot.callbackQuery("junk_cancel", async (ctx) => {
    const msg = ctx.callbackQuery.message;
    if (!msg) return;
    try {
      const chatId = String(msg.chat.id);
      const resolved = await resolveMessageAccount(env, chatId, msg.message_id);
      if (!resolved.ok) {
        await ctx.answerCallbackQuery({ text: resolved.error });
        return;
      }
      const keyboard = await resolveStarredKeyboard(
        env,
        chatId,
        msg.message_id,
        resolved.mapping.email_message_id,
        resolved.account.id,
      );
      await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      await ctx.answerCallbackQuery();
    } catch (err) {
      await reportErrorToObservability(env, "bot.junk_cancel_failed", err);
      await ctx.answerCallbackQuery({
        text: t("common:error.operationFailed"),
      });
    }
  });
}
