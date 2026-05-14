import { resolveMessageAccount } from "@worker/bot/utils/message-context";
import { t } from "@worker/i18n";
import { accountCanArchive } from "@worker/providers";
import type { Env } from "@worker/types";
import { archiveEmailAndCleanup } from "@worker/utils/message-actions";
import { reportErrorToObservability } from "@worker/utils/observability";
import type { Bot } from "grammy";

/** 归档 inline button callback */
export const registerArchiveHandler = (bot: Bot, env: Env) => {
  bot.callbackQuery("archive", async (ctx) => {
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
};
