import type { Bot } from 'grammy';
import { getAccountById } from '../../db/accounts';
import { getMessageMapping } from '../../db/message-map';
import { getAccessToken, markAsRead } from '../../services/gmail';
import type { Env } from '../../types';

/** 任意 emoji reaction → 标记 Gmail 已读 */
export function registerReactionHandler(bot: Bot, env: Env) {
	bot.on('message_reaction', async (ctx) => {
		const chatId = String(ctx.chat.id);
		const messageId = ctx.messageReaction.message_id;

		const mapping = await getMessageMapping(env.DB, chatId, messageId);
		if (!mapping) return;

		// 有新 reaction 就标记已读
		const hasNewReaction = (ctx.messageReaction.new_reaction || []).length > 0;
		if (!hasNewReaction) return;

		const account = await getAccountById(env.DB, mapping.account_id);
		if (!account) return;

		const token = await getAccessToken(env, account);
		await markAsRead(token, mapping.gmail_message_id);
		console.log(`Marked as read: gmail=${mapping.gmail_message_id}`);
	});
}
