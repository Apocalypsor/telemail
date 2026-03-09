import type { TelegramUser } from '../types';

/** 登录时 upsert 用户信息 */
export async function upsertUser(
	db: D1Database,
	telegramId: string,
	firstName: string,
	lastName?: string,
	username?: string,
	photoUrl?: string,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO users (telegram_id, first_name, last_name, username, photo_url, last_login_at)
			 VALUES (?, ?, ?, ?, ?, datetime('now'))
			 ON CONFLICT (telegram_id) DO UPDATE SET
			   first_name = excluded.first_name,
			   last_name = excluded.last_name,
			   username = excluded.username,
			   photo_url = excluded.photo_url,
			   last_login_at = datetime('now')`,
		)
		.bind(telegramId, firstName, lastName ?? null, username ?? null, photoUrl ?? null)
		.run();
}

/** 获取所有已登录过的用户 */
export async function getAllUsers(db: D1Database): Promise<TelegramUser[]> {
	const { results } = await db.prepare('SELECT * FROM users ORDER BY last_login_at DESC').all<TelegramUser>();
	return results;
}
