/** Reminders 列表补充邮件信息，以及到期邮件提醒的 Things Cloud 批量推送。 */
import { MailService } from "@worker/api/modules/mail/service";
import { ThingsCloudClient } from "@worker/clients/things-cloud";
import type { ThingsTodoInput } from "@worker/clients/things-cloud/types";
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
} from "@worker/utils/mail/token";
import { reportErrorToObservability } from "@worker/utils/observability";
import { resolveUserTimeZone } from "@worker/utils/time-zone";
import { getWorkerBaseUrl } from "@worker/utils/url";
import type { EnrichedReminder } from "./types";

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

  static async pushThingsTasksForDueEmailReminders(
    env: Env,
    reminders: Reminder[],
  ): Promise<void> {
    const byUser = new Map<string, Reminder[]>();
    for (const reminder of reminders) {
      if (reminder.account_id == null || reminder.email_message_id == null)
        continue;
      const group = byUser.get(reminder.telegram_user_id) ?? [];
      group.push(reminder);
      byUser.set(reminder.telegram_user_id, group);
    }
    await Promise.all(
      Array.from(byUser.entries(), async ([userId, group]) => {
        try {
          const user = await getUserByTelegramId(env.DB, userId);
          const email = user?.things_cloud_email?.trim();
          const password = user?.things_cloud_password;
          if (!email || !password) return;

          const pending: { reminderId: number; input: ThingsTodoInput }[] = [];
          for (const reminder of group) {
            const input = await RemindersService.prepareThingsTodo(
              env,
              reminder,
            );
            if (input) pending.push({ reminderId: reminder.id, input });
          }
          if (pending.length === 0) return;
          const client = new ThingsCloudClient({
            email,
            password,
            appInstanceId:
              await RemindersService.getOrCreateThingsAppInstanceId(
                env,
                userId,
              ),
            endpoint: env.THINGS_CLOUD_ENDPOINT,
          });
          const ids = await client.createTodos(
            pending.map(({ input }) => ({
              ...input,
              timeZone: resolveUserTimeZone(user.user_timezone),
            })),
          );
          await Promise.all(
            pending.map(({ reminderId }, index) =>
              updateReminderThingsTaskId(env.DB, reminderId, ids[index]),
            ),
          );
        } catch (err) {
          await reportErrorToObservability(
            env,
            "reminders.things_push_failed",
            err,
            {
              reminderIds: group.map(({ id }) => id),
              telegramUserId: userId,
            },
          );
        }
      }),
    );
  }

  private static async getOrCreateThingsAppInstanceId(
    env: Env,
    telegramUserId: string,
  ): Promise<string> {
    const cached = await getThingsAppInstanceId(env.EMAIL_KV, telegramUserId);
    if (cached) return cached;
    const generated = generateThingsAppInstanceId();
    await putThingsAppInstanceId(env.EMAIL_KV, telegramUserId, generated);
    return generated;
  }

  private static async prepareThingsTodo(
    env: Env,
    reminder: Reminder,
  ): Promise<ThingsTodoInput | null> {
    if (reminder.account_id == null || reminder.email_message_id == null)
      return null;
    const current = await getReminderById(env.DB, reminder.id);
    if (!current || current.things_task_id) return null;
    const account = await getAccountById(env.DB, reminder.account_id);
    if (!account) return null;
    const id = await deriveThingsUuid(
      env.ADMIN_SECRET,
      `reminder:${reminder.id}`,
    );
    const token = await generateMailTokenById(
      env.ADMIN_SECRET,
      reminder.email_message_id,
      reminder.account_id,
    );
    const mailUrl = buildWebMailUrl(
      getWorkerBaseUrl(env),
      reminder.email_message_id,
      reminder.account_id,
      token,
    );
    const title = reminder.text || reminder.email_subject || "Email reminder";
    const notes = [
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
    return { id, title, notes, today: true };
  }
}
