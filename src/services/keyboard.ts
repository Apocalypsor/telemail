import { InlineKeyboard } from 'grammy';
import { STAR_KEYBOARD, starKeyboardWithMailUrl, STARRED_KEYBOARD, starredKeyboardWithMailUrl } from '../bot';
import { getMessageMapping } from '../db/message-map';
import type { Env } from '../types';
import { generateMailToken } from '../utils/hash';

/** 根据星标状态构建邮件消息键盘 */
export async function buildEmailKeyboard(
	env: Env,
	emailMessageId: string,
	accountEmail: string | null,
	chatId: string,
	starred: boolean,
): Promise<InlineKeyboard> {
	if (env.WORKER_URL && accountEmail) {
		const mailToken = await generateMailToken(env.ADMIN_SECRET, emailMessageId, accountEmail, chatId);
		const mailUrl = `${env.WORKER_URL.replace(/\/$/, '')}/mail/${emailMessageId}?email=${encodeURIComponent(accountEmail)}&chatId=${encodeURIComponent(chatId)}&t=${mailToken}`;
		return starred ? starredKeyboardWithMailUrl(mailUrl) : starKeyboardWithMailUrl(mailUrl);
	}
	return starred ? STARRED_KEYBOARD : STAR_KEYBOARD;
}

/** 从 DB 读取当前星标状态后构建键盘（LLM 处理后编辑消息使用） */
export async function resolveStarredKeyboard(
	env: Env,
	chatId: string,
	tgMessageId: number,
	emailMessageId: string,
	accountEmail: string | null,
): Promise<InlineKeyboard> {
	const mapping = await getMessageMapping(env.DB, chatId, tgMessageId);
	return buildEmailKeyboard(env, emailMessageId, accountEmail, chatId, !!mapping?.starred);
}
