import { users } from "@worker/db/schema";
import type { TelegramUser } from "@worker/types";
import { desc, eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

/** 登录时 upsert 用户信息（approved 仅在首次 INSERT 时设置，UPDATE 不覆盖） */
export async function upsertUser(
  d1: D1Database,
  telegramId: string,
  firstName: string,
  lastName?: string,
  username?: string,
  photoUrl?: string,
  approved?: number,
): Promise<void> {
  const db = drizzle(d1);
  const now = new Date();
  await db
    .insert(users)
    .values({
      telegram_id: telegramId,
      first_name: firstName,
      last_name: lastName ?? null,
      username: username ?? null,
      photo_url: photoUrl ?? null,
      approved: approved ?? 0,
      last_login_at: now,
    })
    .onConflictDoUpdate({
      target: users.telegram_id,
      set: {
        first_name: firstName,
        last_name: lastName ?? null,
        username: username ?? null,
        photo_url: photoUrl ?? null,
        last_login_at: now,
      },
    });
}

/** 根据 Telegram ID 查询用户 */
export async function getUserByTelegramId(
  d1: D1Database,
  telegramId: string,
): Promise<TelegramUser | null> {
  const db = drizzle(d1);
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.telegram_id, telegramId));
  return row ?? null;
}

/** 获取所有已登录过的用户 */
export async function getAllUsers(d1: D1Database): Promise<TelegramUser[]> {
  const db = drizzle(d1);
  return db.select().from(users).orderBy(desc(users.last_login_at));
}

/** 获取除管理员外的所有用户 */
export async function getNonAdminUsers(
  d1: D1Database,
  adminTelegramId: string,
): Promise<TelegramUser[]> {
  const db = drizzle(d1);
  return db
    .select()
    .from(users)
    .where(ne(users.telegram_id, adminTelegramId))
    .orderBy(desc(users.last_login_at));
}

/** 批准用户 */
export async function approveUser(
  d1: D1Database,
  telegramId: string,
): Promise<void> {
  const db = drizzle(d1);
  await db
    .update(users)
    .set({ approved: 1 })
    .where(eq(users.telegram_id, telegramId));
}

/** 拒绝用户（重置为未批准） */
export async function rejectUser(
  d1: D1Database,
  telegramId: string,
): Promise<void> {
  const db = drizzle(d1);
  await db
    .update(users)
    .set({ approved: 0 })
    .where(eq(users.telegram_id, telegramId));
}

/** 删除用户记录 */
export async function deleteUser(
  d1: D1Database,
  telegramId: string,
): Promise<void> {
  const db = drizzle(d1);
  await db.delete(users).where(eq(users.telegram_id, telegramId));
}
