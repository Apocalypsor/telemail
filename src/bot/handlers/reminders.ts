import { ROUTE_REMINDERS } from "@handlers/hono/routes";
import { t } from "@i18n";
import type { Bot } from "grammy";
import type { Env } from "@/types";

export function registerReminderHandlers(bot: Bot, env: Env) {
  bot.command("remind", async (ctx) => {
    if (!env.WORKER_URL) {
      return ctx.reply(t("reminders:workerUrlMissing"));
    }
    const url = `${env.WORKER_URL.replace(/\/$/, "")}${ROUTE_REMINDERS}`;
    // grammy 的 InlineKeyboard 不直接暴露 web_app 字段，手写 reply_markup
    return ctx.reply(t("reminders:intro"), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t("reminders:openButton"), web_app: { url } }],
        ],
      },
    });
  });
}
