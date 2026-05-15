import { getDb } from "@worker/db/client";
import { users } from "@worker/db/schema";
import type { TelegramUser } from "@worker/types";
import { desc, eq, ne } from "drizzle-orm";

export interface UserThingsSettingsUpdate {
  email: string;
  password?: string | null;
}

type UserUpdate = Partial<typeof users.$inferInsert>;

/** 登录时 upsert 用户信息（approved 仅在首次 INSERT 时设置，UPDATE 不覆盖） */
export const upsertUser = async (
  d1: D1Database,
  telegramId: string,
  firstName: string,
  lastName?: string,
  username?: string,
  photoUrl?: string,
  approved?: number,
): Promise<void> => {
  const db = getDb(d1);
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
};

/** 根据 Telegram ID 查询用户 */
export const getUserByTelegramId = async (
  d1: D1Database,
  telegramId: string,
): Promise<TelegramUser | null> => {
  const db = getDb(d1);
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.telegram_id, telegramId));
  return row ?? null;
};

/** 获取所有已登录过的用户 */
export const getAllUsers = async (d1: D1Database): Promise<TelegramUser[]> => {
  const db = getDb(d1);
  return db.select().from(users).orderBy(desc(users.last_login_at));
};

/** 获取所有已批准用户 */
export const getApprovedUsers = async (
  d1: D1Database,
): Promise<TelegramUser[]> => {
  const db = getDb(d1);
  return db
    .select()
    .from(users)
    .where(eq(users.approved, 1))
    .orderBy(desc(users.last_login_at));
};

/** 获取除管理员外的所有用户 */
export const getNonAdminUsers = async (
  d1: D1Database,
  adminTelegramId: string,
): Promise<TelegramUser[]> => {
  const db = getDb(d1);
  return db
    .select()
    .from(users)
    .where(ne(users.telegram_id, adminTelegramId))
    .orderBy(desc(users.last_login_at));
};

/** 批准用户 */
export const approveUser = async (
  d1: D1Database,
  telegramId: string,
): Promise<void> => {
  const db = getDb(d1);
  await db
    .update(users)
    .set({ approved: 1 })
    .where(eq(users.telegram_id, telegramId));
};

/** 拒绝用户（重置为未批准） */
export const rejectUser = async (
  d1: D1Database,
  telegramId: string,
): Promise<void> => {
  const db = getDb(d1);
  await db
    .update(users)
    .set({ approved: 0 })
    .where(eq(users.telegram_id, telegramId));
};

/** 更新单个用户的 Things Cloud 配置。password omitted 时保留旧值。 */
export const updateUserThingsSettings = async (
  d1: D1Database,
  telegramId: string,
  input: UserThingsSettingsUpdate,
): Promise<void> => {
  const db = getDb(d1);
  const values: UserUpdate = {
    things_cloud_email: input.email,
  };
  if (input.password !== undefined) {
    values.things_cloud_password = input.password;
  }
  await db.update(users).set(values).where(eq(users.telegram_id, telegramId));
};

/** 记录用户最近一次打开 Mini App 时的设备时区，供跨功能复用。 */
export const updateUserTimezone = async (
  d1: D1Database,
  telegramId: string,
  userTimezone: string,
): Promise<void> => {
  const db = getDb(d1);
  await db
    .update(users)
    .set({ user_timezone: userTimezone })
    .where(eq(users.telegram_id, telegramId));
};

/** 清空单个用户的 Things Cloud 配置。 */
export const clearUserThingsSettings = async (
  d1: D1Database,
  telegramId: string,
): Promise<void> => {
  const db = getDb(d1);
  await db
    .update(users)
    .set({
      things_cloud_email: null,
      things_cloud_password: null,
    })
    .where(eq(users.telegram_id, telegramId));
};

/** 删除用户记录 */
export const deleteUser = async (
  d1: D1Database,
  telegramId: string,
): Promise<void> => {
  const db = getDb(d1);
  await db.delete(users).where(eq(users.telegram_id, telegramId));
};
