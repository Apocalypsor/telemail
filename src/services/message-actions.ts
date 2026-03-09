import { InlineKeyboard } from 'grammy';
import { getAccountById } from '../db/accounts';
import { getMessageMapping, updateStarred } from '../db/message-map';
import { STAR_KEYBOARD, STARRED_KEYBOARD, starKeyboardWithMailUrl, starredKeyboardWithMailUrl } from '../bot';
import type { Env } from '../types';
import { generateMailToken } from '../utils/hash';
import { addStar, getAccessToken, markAsRead, removeStar } from './gmail';
import { reportErrorToObservability } from './observability';

type ToggleStarResult =
	| { ok: true; keyboard: InlineKeyboard; gmailMessageId: string }
	| { ok: false; reason: string };

/** 切换 Gmail 星标并返回新的 keyboard */
export async function toggleStar(env: Env, chatId: string, messageId: number, starred: boolean): Promise<ToggleStarResult> {
	const mapping = await getMessageMapping(env.DB, chatId, messageId);
	if (!mapping) return { ok: false, reason: '消息映射未找到' };

	const account = await getAccountById(env.DB, mapping.account_id);
	if (!account) return { ok: false, reason: '账号未找到' };

	const token = await getAccessToken(env, account);
	if (starred) {
		await addStar(token, mapping.gmail_message_id);
	} else {
		await removeStar(token, mapping.gmail_message_id);
	}
	await updateStarred(env.DB, chatId, messageId, starred);

	let keyboard: InlineKeyboard = starred ? STARRED_KEYBOARD : STAR_KEYBOARD;
	if (env.WORKER_URL) {
		const mailToken = await generateMailToken(env.ADMIN_SECRET, mapping.gmail_message_id, chatId);
		const mailUrl = `${env.WORKER_URL.replace(/\/$/, '')}/mail/${mapping.gmail_message_id}?t=${mailToken}`;
		keyboard = starred ? starredKeyboardWithMailUrl(mailUrl) : starKeyboardWithMailUrl(mailUrl);
	}

	return { ok: true, keyboard, gmailMessageId: mapping.gmail_message_id };
}

/** 通过 Telegram 消息标记对应 Gmail 已读 */
export async function markAsReadByMessage(env: Env, chatId: string, messageId: number): Promise<void> {
	const mapping = await getMessageMapping(env.DB, chatId, messageId);
	if (!mapping) {
		console.log(`No mapping found for chat=${chatId}, message=${messageId}`);
		return;
	}

	const account = await getAccountById(env.DB, mapping.account_id);
	if (!account) return;

	try {
		const token = await getAccessToken(env, account);
		await markAsRead(token, mapping.gmail_message_id);
		console.log(`Marked as read: gmail=${mapping.gmail_message_id}`);
	} catch (err) {
		await reportErrorToObservability(env, 'bot.mark_read_failed', err, { gmailMessageId: mapping.gmail_message_id });
	}
}
