import { resolveMessageAccount } from "@bot/utils/message-context";
import { deleteMappingByEmailId } from "@db/message-map";
import { t } from "@i18n";
import { accountCanArchive, getEmailProvider } from "@providers";
import { deleteMessage } from "@services/telegram";
import { reportErrorToObservability } from "@utils/observability";
import type { Bot } from "grammy";
import type { Env } from "@/types";

/** 归档 inline button callback */
export function registerArchiveHandler(bot: Bot, env: Env) {
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

      const provider = getEmailProvider(account, env);
      await provider.archiveMessage(mapping.email_message_id);

      await deleteMessage(env.TELEGRAM_BOT_TOKEN, chatId, msg.message_id).catch(
        () => {},
      );
      await deleteMappingByEmailId(
        env.DB,
        mapping.email_message_id,
        mapping.account_id,
      ).catch(() => {});

      await ctx.answerCallbackQuery({ text: t("archive:archived") });
      console.log(`Archived: email=${mapping.email_message_id}`);
    } catch (err) {
      await reportErrorToObservability(env, "bot.archive_failed", err);
      await ctx.answerCallbackQuery({
        text: t("common:error.operationFailed"),
      });
    }
  });
}
