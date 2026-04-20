import { listDueReminders, markReminderSent } from "@db/reminders";
import { escapeMdV2 } from "@utils/markdown-v2";
import { reportErrorToObservability } from "@utils/observability";
import type { Env } from "@/types";
import { sendTextMessage } from "./telegram";

/** 提醒文本最大长度（Telegram 单条消息上限是 4096） */
export const REMINDER_TEXT_MAX = 1000;
/** 单用户最多 pending 提醒数 */
export const REMINDER_PER_USER_LIMIT = 100;

/**
 * 扫描 D1 中所有到期的提醒，向用户私聊推送，并标记已发送。
 * 每分钟 cron 调用。单次最多处理 200 条，防止极端情况下 cron 超时。
 */
export async function dispatchDueReminders(env: Env): Promise<void> {
  const due = await listDueReminders(env.DB, new Date().toISOString());
  if (due.length === 0) return;

  await Promise.allSettled(
    due.map(async (r) => {
      try {
        const text = `⏰ *提醒*\n${escapeMdV2(r.text)}`;
        await sendTextMessage(env.TELEGRAM_BOT_TOKEN, r.telegram_user_id, text);
        await markReminderSent(env.DB, r.id);
      } catch (err) {
        // 不标记 sent_at —— 下个 cron 会重试。仅在 reportErrorToObservability 报告错误。
        await reportErrorToObservability(env, "reminders.send_failed", err, {
          reminderId: r.id,
          telegramUserId: r.telegram_user_id,
        });
      }
    }),
  );
}
