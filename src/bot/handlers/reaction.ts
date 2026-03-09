import type { Bot } from 'grammy';
import { getAccountById } from '../../db/accounts';
import { getMessageMapping } from '../../db/message-map';
import { getAccessToken, markAsRead } from '../../services/gmail';
import { reportErrorToObservability } from '../../services/observability';
import type { Env } from '../../types';

/** 任意 emoji reaction → 标记 Gmail 已读（同时支持群组和频道） */
export function registerReactionHandler(bot: Bot, env: Env) {
	// 群组/私聊：per-user reaction
	bot.on('message_reaction', async (ctx) => {
		const chatId = String(ctx.chat.id);
		const messageId = ctx.messageReaction.message_id;
		console.log(`Reaction received: chat=${chatId}, message=${messageId}`);

		const hasNewReaction = (ctx.messageReaction.new_reaction || []).length > 0;
		if (!hasNewReaction) return;

		await tryMarkAsRead(env, chatId, messageId);
	});

	// 频道：匿名 reaction（只有数量）
	bot.on('message_reaction_count', async (ctx) => {
		const chatId = String(ctx.chat.id);
		const messageId = ctx.messageReactionCount.message_id;
		const totalCount = (ctx.messageReactionCount.reactions || []).reduce((sum, r) => sum + r.total_count, 0);
		console.log(`Reaction count update: chat=${chatId}, message=${messageId}, total=${totalCount}`);

		if (totalCount <= 0) return;

		await tryMarkAsRead(env, chatId, messageId);
	});
}

async function tryMarkAsRead(env: Env, chatId: string, messageId: number): Promise<void> {
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
