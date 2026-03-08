import type { Account } from '../types';

export async function getAllAccounts(db: D1Database): Promise<Account[]> {
	const { results } = await db.prepare('SELECT * FROM accounts ORDER BY id').all<Account>();
	return results;
}

export async function getAccountById(db: D1Database, id: number): Promise<Account | null> {
	return db.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first<Account>();
}

export async function getAccountByEmail(db: D1Database, email: string): Promise<Account | null> {
	return db.prepare('SELECT * FROM accounts WHERE email = ?').bind(email).first<Account>();
}

export async function createAccount(db: D1Database, email: string, chatId: string, label?: string): Promise<Account> {
	const result = await db
		.prepare('INSERT INTO accounts (email, chat_id, label) VALUES (?, ?, ?) RETURNING *')
		.bind(email, chatId, label ?? null)
		.first<Account>();
	if (!result) throw new Error('Failed to create account');
	return result;
}

export async function deleteAccount(db: D1Database, id: number): Promise<void> {
	await db.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run();
}

export async function updateRefreshToken(db: D1Database, id: number, refreshToken: string): Promise<void> {
	await db.prepare("UPDATE accounts SET refresh_token = ?, updated_at = datetime('now') WHERE id = ?").bind(refreshToken, id).run();
}

export async function updateHistoryId(db: D1Database, id: number, historyId: string): Promise<void> {
	// 确保存入的是纯整数字符串，避免 D1 读回时变成浮点数
	const sanitized = String(parseInt(historyId, 10));
	await db.prepare("UPDATE accounts SET history_id = ?, updated_at = datetime('now') WHERE id = ?").bind(sanitized, id).run();
}
