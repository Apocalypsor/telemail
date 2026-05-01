/** message_map: Telegram 消息 ↔ 邮件消息映射 */
import { messageMap } from "@worker/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

type MessageMapRow = typeof messageMap.$inferSelect;

/** 对外暴露的 mapping 类型 —— 隐藏 created_at（消费方不需要） */
export type MessageMapping = Omit<MessageMapRow, "created_at">;

/** 保存 Telegram → 邮件消息映射，返回是否实际插入（false = 重复，被 IGNORE） */
export async function putMessageMapping(
  d1: D1Database,
  mapping: Pick<
    MessageMapping,
    "tg_message_id" | "tg_chat_id" | "email_message_id" | "account_id"
  >,
): Promise<boolean> {
  const db = drizzle(d1);
  const result = await db
    .insert(messageMap)
    .values({
      tg_message_id: mapping.tg_message_id,
      tg_chat_id: mapping.tg_chat_id,
      email_message_id: mapping.email_message_id,
      account_id: mapping.account_id,
    })
    .onConflictDoNothing();
  return (result.meta?.changes ?? 0) > 0;
}

/** 根据 Telegram 消息查找对应的邮件消息 */
export async function getMessageMapping(
  d1: D1Database,
  chatId: string,
  tgMessageId: number,
): Promise<MessageMapping | null> {
  const db = drizzle(d1);
  const [row] = await db
    .select()
    .from(messageMap)
    .where(
      and(
        eq(messageMap.tg_chat_id, chatId),
        eq(messageMap.tg_message_id, tgMessageId),
      ),
    );
  return row ?? null;
}

/** 根据邮件 ID 列表批量查找对应的 Telegram 消息映射 */
export async function getMappingsByEmailIds(
  d1: D1Database,
  accountId: number,
  emailMessageIds: string[],
): Promise<MessageMapping[]> {
  if (emailMessageIds.length === 0) return [];
  const db = drizzle(d1);
  return db
    .select()
    .from(messageMap)
    .where(
      and(
        eq(messageMap.account_id, accountId),
        inArray(messageMap.email_message_id, emailMessageIds),
      ),
    );
}

/** 删除指定账号的所有消息映射 */
export async function deleteMappingsByAccountId(
  d1: D1Database,
  accountId: number,
): Promise<void> {
  const db = drizzle(d1);
  await db.delete(messageMap).where(eq(messageMap.account_id, accountId));
}

/** 删除单封邮件的映射 —— TG 消息被用户从聊天里删了（或失效），需要让
 *  `deliverEmailToTelegram` 重新投递时不要被 `(chat_id, email_message_id,
 *  account_id)` 唯一索引挡住。 */
export async function deleteMessageMapping(
  d1: D1Database,
  accountId: number,
  emailMessageId: string,
): Promise<void> {
  const db = drizzle(d1);
  await db
    .delete(messageMap)
    .where(
      and(
        eq(messageMap.account_id, accountId),
        eq(messageMap.email_message_id, emailMessageId),
      ),
    );
}

/** 更新邮件 short_summary（LLM 分析成功后调用） */
export async function updateShortSummary(
  d1: D1Database,
  accountId: number,
  emailMessageId: string,
  shortSummary: string,
): Promise<void> {
  const db = drizzle(d1);
  await db
    .update(messageMap)
    .set({ short_summary: shortSummary })
    .where(
      and(
        eq(messageMap.account_id, accountId),
        eq(messageMap.email_message_id, emailMessageId),
      ),
    );
}

/** 删除单条消息映射（垃圾邮件删除后清理） */
export async function deleteMappingByEmailId(
  d1: D1Database,
  emailMessageId: string,
  accountId: number,
): Promise<void> {
  const db = drizzle(d1);
  await db
    .delete(messageMap)
    .where(
      and(
        eq(messageMap.email_message_id, emailMessageId),
        eq(messageMap.account_id, accountId),
      ),
    );
}
