import { resolveMessageAccount } from "@bot/utils/message-context";
import { deleteMappingByEmailId } from "@db/message-map";
import { t } from "@i18n";
import { getEmailProvider } from "@providers";
import { deleteMessage } from "@services/telegram";
import { reportErrorToObservability } from "@utils/observability";
import type { Bot } from "grammy";
import type { Env } from "@/types";

/** 标记为垃圾邮件 inline button callback */
export function registerJunkHandler(bot: Bot, env: Env) {
  bot.callbackQuery("junk_mark", async (ctx) => {
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

      // 移到垃圾邮件文件夹
      const provider = getEmailProvider(account, env);
      await provider.markAsJunk(mapping.email_message_id);

      // 删除 TG 消息和映射
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
}
