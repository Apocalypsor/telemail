import { t } from "@i18n";
import { refreshEmail } from "@services/bridge";
import { reportErrorToObservability } from "@utils/observability";
import type { Bot } from "grammy";
import type { Env } from "@/types";

/** 刷新邮件 inline button callback */
export function registerRefreshHandler(bot: Bot, env: Env) {
  bot.callbackQuery("refresh", async (ctx) => {
    const msg = ctx.callbackQuery.message;
    if (!msg) return;

    await ctx.answerCallbackQuery({ text: t("bridge:refreshing") });

    try {
      const isCaption = "caption" in msg && !!msg.caption;
      const result = await refreshEmail(
        env,
        String(msg.chat.id),
        msg.message_id,
        isCaption,
      );

      if (!result.ok) {
        await ctx.answerCallbackQuery({ text: result.reason });
        return;
      }

      console.log(`Refreshed: chat=${msg.chat.id}, message=${msg.message_id}`);
    } catch (err) {
      await reportErrorToObservability(env, "bot.refresh_failed", err);
      await ctx.answerCallbackQuery({
        text: t("common:error.operationFailed"),
      });
    }
  });
}
