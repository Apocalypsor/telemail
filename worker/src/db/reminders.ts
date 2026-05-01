import { getDb } from "@worker/db/client";
import { reminders } from "@worker/db/schema";
import { and, asc, count, eq, isNull, lte } from "drizzle-orm";

/** D1 reminders 表记录 —— Drizzle `mode: "timestamp_ms"` 自动把 INTEGER ms epoch
 *  读出来 wrap 成 Date、写入时调 `.getTime()`。 */
export type Reminder = typeof reminders.$inferSelect;

/** 创建提醒的输入：邮件上下文五个字段同时为 NULL = 通用提醒；同时 set = 邮件提醒 */
export interface CreateReminderInput {
  telegramUserId: string;
  text: string;
  remindAt: Date;
  /** 以下五个字段绑定一封邮件；要么全 set，要么全 omit */
  accountId?: number;
  emailMessageId?: string;
  emailSubject?: string;
  tgChatId?: string;
  tgMessageId?: number;
}

/** 创建提醒，返回新行 id */
export async function createReminder(
  d1: D1Database,
  input: CreateReminderInput,
): Promise<number> {
  const db = getDb(d1);
  const [row] = await db
    .insert(reminders)
    .values({
      telegram_user_id: input.telegramUserId,
      text: input.text,
      remind_at: input.remindAt,
      account_id: input.accountId ?? null,
      email_message_id: input.emailMessageId ?? null,
      email_subject: input.emailSubject ?? null,
      tg_chat_id: input.tgChatId ?? null,
      tg_message_id: input.tgMessageId ?? null,
    })
    .returning({ id: reminders.id });
  return row.id;
}

/** 列出某用户所有待发送提醒，按时间升序 */
export async function listPendingReminders(
  d1: D1Database,
  telegramUserId: string,
): Promise<Reminder[]> {
  const db = getDb(d1);
  return db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.telegram_user_id, telegramUserId),
        isNull(reminders.sent_at),
      ),
    )
    .orderBy(asc(reminders.remind_at));
}

/** 列出某用户某封邮件下所有待发送提醒（按时间升序） */
export async function listPendingRemindersForEmail(
  d1: D1Database,
  telegramUserId: string,
  accountId: number,
  emailMessageId: string,
): Promise<Reminder[]> {
  const db = getDb(d1);
  return db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.telegram_user_id, telegramUserId),
        eq(reminders.account_id, accountId),
        eq(reminders.email_message_id, emailMessageId),
        isNull(reminders.sent_at),
      ),
    )
    .orderBy(asc(reminders.remind_at));
}

/** 统计某封邮件未发送的提醒数（用于 keyboard 上显示数字） */
export async function countPendingRemindersForEmail(
  d1: D1Database,
  accountId: number,
  emailMessageId: string,
): Promise<number> {
  const db = getDb(d1);
  const [row] = await db
    .select({ n: count() })
    .from(reminders)
    .where(
      and(
        eq(reminders.account_id, accountId),
        eq(reminders.email_message_id, emailMessageId),
        isNull(reminders.sent_at),
      ),
    );
  return row?.n ?? 0;
}

/** 按 id 取单条提醒（删除前用来读 account_id/email_message_id 决定是否刷键盘） */
export async function getReminderById(
  d1: D1Database,
  id: number,
): Promise<Reminder | null> {
  const db = getDb(d1);
  const [row] = await db.select().from(reminders).where(eq(reminders.id, id));
  return row ?? null;
}

/** 编辑某用户的待发送提醒（只能改时间和备注；邮件上下文不变）。
 *  WHERE 双重约束：不允许改别人的，sent_at IS NULL 防止改已发送的。 */
export async function updatePendingReminder(
  d1: D1Database,
  telegramUserId: string,
  id: number,
  patch: { text: string; remindAt: Date },
): Promise<boolean> {
  const db = getDb(d1);
  const result = await db
    .update(reminders)
    .set({ text: patch.text, remind_at: patch.remindAt })
    .where(
      and(
        eq(reminders.id, id),
        eq(reminders.telegram_user_id, telegramUserId),
        isNull(reminders.sent_at),
      ),
    );
  return (result.meta?.changes ?? 0) > 0;
}

/** 删除某用户的待发送提醒（不允许删别人的，所以 WHERE 双重约束） */
export async function deletePendingReminder(
  d1: D1Database,
  telegramUserId: string,
  id: number,
): Promise<boolean> {
  const db = getDb(d1);
  const result = await db
    .delete(reminders)
    .where(
      and(
        eq(reminders.id, id),
        eq(reminders.telegram_user_id, telegramUserId),
        isNull(reminders.sent_at),
      ),
    );
  return (result.meta?.changes ?? 0) > 0;
}

/** 取所有 remind_at <= now 的待发送提醒（cron 调用） */
export async function listDueReminders(
  d1: D1Database,
  now: Date,
  limit = 200,
): Promise<Reminder[]> {
  const db = getDb(d1);
  return db
    .select()
    .from(reminders)
    .where(and(isNull(reminders.sent_at), lte(reminders.remind_at, now)))
    .orderBy(asc(reminders.remind_at))
    .limit(limit);
}

/** 标记提醒已发送 */
export async function markReminderSent(
  d1: D1Database,
  id: number,
): Promise<void> {
  const db = getDb(d1);
  await db
    .update(reminders)
    .set({ sent_at: new Date() })
    .where(eq(reminders.id, id));
}

/** 统计某用户待发送提醒数量（用于上限保护） */
export async function countPendingReminders(
  d1: D1Database,
  telegramUserId: string,
): Promise<number> {
  const db = getDb(d1);
  const [row] = await db
    .select({ n: count() })
    .from(reminders)
    .where(
      and(
        eq(reminders.telegram_user_id, telegramUserId),
        isNull(reminders.sent_at),
      ),
    );
  return row?.n ?? 0;
}
