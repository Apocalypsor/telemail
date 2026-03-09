import type { Bot } from 'grammy';
import { getAccountById } from '../../db/accounts';
import { getMessageMapping, updateStarred } from '../../db/message-map';
import { addStar, getAccessToken, removeStar } from '../../services/gmail';
import { STAR_KEYBOARD, STARRED_KEYBOARD } from '../keyboards';
import type { Env } from '../../types';

/** 星标/取消星标 inline button callback */
export function registerStarHandler(bot: Bot, env: Env) {
	bot.callbackQuery('star', async (ctx) => {
		const msg = ctx.callbackQuery.message;
		if (!msg) return;

		const chatId = String(msg.chat.id);
		const mapping = await getMessageMapping(env.DB, chatId, msg.message_id);
		if (!mapping) {
			await ctx.answerCallbackQuery({ text: '消息映射未找到' });
			return;
		}

		const account = await getAccountById(env.DB, mapping.account_id);
		if (!account) {
			await ctx.answerCallbackQuery({ text: '账号未找到' });
			return;
		}

		const token = await getAccessToken(env, account);
		await addStar(token, mapping.gmail_message_id);
		await updateStarred(env.DB, chatId, msg.message_id, true);
		await ctx.editMessageReplyMarkup({ reply_markup: STARRED_KEYBOARD });
		await ctx.answerCallbackQuery({ text: '⭐ 已加星标' });
		console.log(`Starred: gmail=${mapping.gmail_message_id}`);
	});

	bot.callbackQuery('unstar', async (ctx) => {
		const msg = ctx.callbackQuery.message;
		if (!msg) return;

		const chatId = String(msg.chat.id);
		const mapping = await getMessageMapping(env.DB, chatId, msg.message_id);
		if (!mapping) {
			await ctx.answerCallbackQuery({ text: '消息映射未找到' });
			return;
		}

		const account = await getAccountById(env.DB, mapping.account_id);
		if (!account) {
			await ctx.answerCallbackQuery({ text: '账号未找到' });
			return;
		}

		const token = await getAccessToken(env, account);
		await removeStar(token, mapping.gmail_message_id);
		await updateStarred(env.DB, chatId, msg.message_id, false);
		await ctx.editMessageReplyMarkup({ reply_markup: STAR_KEYBOARD });
		await ctx.answerCallbackQuery({ text: '已取消星标' });
		console.log(`Unstarred: gmail=${mapping.gmail_message_id}`);
	});
}
