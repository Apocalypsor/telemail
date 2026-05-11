/** Reminders 模块的业务用例编排。目前只有一项：list 接口的 enrich 流程
 *  （给 reminder 行附加 mail_token + email_summary）。 */
import { MailService } from "@worker/api/modules/mail/service";
import { ThingsCloudClient } from "@worker/clients/things-cloud";
import {
  deriveThingsUuid,
  generateThingsAppInstanceId,
} from "@worker/clients/things-cloud/utils";
import { getAccountById } from "@worker/db/accounts";
import { getThingsAppInstanceId, putThingsAppInstanceId } from "@worker/db/kv";
import { getMappingsByEmailIds } from "@worker/db/message-map";
import {
  getReminderById,
  type Reminder,
  updateReminderThingsTaskId,
} from "@worker/db/reminders";
import { getUserByTelegramId } from "@worker/db/users";
import type { Env } from "@worker/types";
import {
  buildWebMailUrl,
  generateMailTokenById,
} from "@worker/utils/mail-token";
import { reportErrorToObservability } from "@worker/utils/observability";
import type { EnrichedReminder } from "./types";

const getOrCreateThingsAppInstanceId = async (
  env: Env,
  telegramUserId: string,
): Promise<string> => {
  const cached = await getThingsAppInstanceId(env.EMAIL_KV, telegramUserId);
  if (cached) return cached;
  const generated = generateThingsAppInstanceId();
  await putThingsAppInstanceId(env.EMAIL_KV, telegramUserId, generated);
  return generated;
};
export abstract class RemindersService {
  /** 给 listOnly 模式（主菜单"我的提醒"）的 reminder 列表附加 mail_token + email_summary。
   *  按 (accountId, emailMessageId) 去重，HMAC + mapping 计算两路并发。 */
  static async enrich(
    env: Env,
    items: Reminder[],
  ): Promise<EnrichedReminder[]> {
    const uniq = new Map<
      string,
      { accountId: number; emailMessageId: string }
    >();
    for (const r of items) {
      if (r.account_id && r.email_message_id)
        uniq.set(`${r.account_id}:${r.email_message_id}`, {
          accountId: r.account_id,
          emailMessageId: r.email_message_id,
        });
    }

    const idsByAccount = new Map<number, string[]>();
    for (const { accountId, emailMessageId } of uniq.values()) {
      const arr = idsByAccount.get(accountId);
      if (arr) arr.push(emailMessageId);
      else idsByAccount.set(accountId, [emailMessageId]);
    }

    const tokenByKey = new Map<string, string>();
    const summaryByKey = new Map<string, string>();
    await Promise.all([
      ...Array.from(idsByAccount.entries()).map(async ([accountId, ids]) => {
        const mappings = await getMappingsByEmailIds(env.DB, accountId, ids);
        for (const m of mappings) {
          if (m.short_summary)
            summaryByKey.set(
              `${accountId}:${m.email_message_id}`,
              m.short_summary,
            );
        }
      }),
      ...Array.from(uniq.entries()).map(async ([key, v]) => {
        tokenByKey.set(
          key,
          await MailService.generateToken(
            env.ADMIN_SECRET,
            v.emailMessageId,
            v.accountId,
          ),
        );
      }),
    ]);

    return items.map((r) => {
      const key =
        r.account_id && r.email_message_id
          ? `${r.account_id}:${r.email_message_id}`
          : null;
      return {
        ...r,
        mail_token: key ? (tokenByKey.get(key) ?? null) : null,
        email_summary: key ? (summaryByKey.get(key) ?? null) : null,
      };
    });
  }

  static async pushThingsTaskForDueEmailReminder(
    env: Env,
    reminder: Reminder,
  ): Promise<void> {
    if (reminder.account_id == null || reminder.email_message_id == null)
      return;

    try {
      const current = await getReminderById(env.DB, reminder.id);
      if (!current || current.things_task_id) return;

      const user = await getUserByTelegramId(env.DB, reminder.telegram_user_id);
      const thingsEmail = user?.things_cloud_email?.trim();
      const thingsPassword = user?.things_cloud_password;
      if (!thingsEmail || !thingsPassword) return;

      const account = await getAccountById(env.DB, reminder.account_id);
      if (!account) return;

      const taskId = await deriveThingsUuid(
        env.ADMIN_SECRET,
        `reminder:${reminder.id}`,
      );
      const token = await generateMailTokenById(
        env.ADMIN_SECRET,
        reminder.email_message_id,
        reminder.account_id,
      );
      const mailUrl = env.WORKER_URL
        ? buildWebMailUrl(
            env.WORKER_URL,
            reminder.email_message_id,
            reminder.account_id,
            token,
          )
        : null;
      const title = reminder.text || reminder.email_subject || "Email reminder";
      const notes = [
        reminder.text && reminder.text !== title
          ? `Note: ${reminder.text}`
          : null,
        `Reminder fired: ${new Date().toISOString()}`,
        `Original reminder time: ${reminder.remind_at.toISOString()}`,
        account.email ? `Account: ${account.email}` : null,
        reminder.email_subject && reminder.email_subject !== title
          ? `Mail: ${reminder.email_subject}`
          : null,
        mailUrl ? `Open mail: ${mailUrl}` : null,
        `Telemail reminder #${reminder.id}`,
      ]
        .filter((line): line is string => !!line)
        .join("\n");

      const client = new ThingsCloudClient({
        email: thingsEmail,
        password: thingsPassword,
        appInstanceId: await getOrCreateThingsAppInstanceId(
          env,
          reminder.telegram_user_id,
        ),
        endpoint: env.THINGS_CLOUD_ENDPOINT,
      });
      const createdTaskId = await client.createTodo({
        id: taskId,
        title,
        notes,
        today: true,
        timeZone: user.user_timezone || env.DEFAULT_USER_TIMEZONE,
      });
      await updateReminderThingsTaskId(env.DB, reminder.id, createdTaskId);
    } catch (err) {
      await reportErrorToObservability(
        env,
        "reminders.things_push_failed",
        err,
        {
          reminderId: reminder.id,
          telegramUserId: reminder.telegram_user_id,
          accountId: reminder.account_id,
          emailMessageId: reminder.email_message_id,
        },
      );
    }
  }
}
