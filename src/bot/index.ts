import { Bot } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { BOT_INFO_TTL, KV_BOT_INFO_KEY } from '../constants';
import { reportErrorToObservability } from '../services/observability';
import type { Env } from '../types';
import { registerReactionHandler } from './handlers/reaction';
import { registerStarHandler } from './handlers/star';

export { STAR_KEYBOARD, starKeyboardWithMailUrl, STARRED_KEYBOARD, starredKeyboardWithMailUrl } from './keyboards';

/** 从 KV 获取 botInfo，首次调用时从 Telegram API 拉取并缓存 */
export async function getBotInfo(env: Env): Promise<UserFromGetMe> {
	const cached = await env.EMAIL_KV.get(KV_BOT_INFO_KEY);
	if (cached) return JSON.parse(cached);

	const resp = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
	if (!resp.ok) throw new Error(`getMe failed: ${resp.status} ${await resp.text()}`);
	const data = (await resp.json()) as { result: UserFromGetMe };
	await env.EMAIL_KV.put(KV_BOT_INFO_KEY, JSON.stringify(data.result), { expirationTtl: BOT_INFO_TTL });
	return data.result;
}

/** 创建 grammY Bot 实例（仅用于 webhook 接收端） */
export function createBot(env: Env, botInfo: UserFromGetMe) {
	const bot = new Bot(env.TELEGRAM_BOT_TOKEN, { botInfo });

	bot.catch(async (err) => {
		await reportErrorToObservability(env, 'bot.handler_error', err.error);
	});

	bot.command('start', (ctx) => {
		const url = env.WORKER_URL?.replace(/\/$/, '') || '';
		return ctx.reply(`欢迎使用 Telemail！请前往 ${url} 管理邮箱`);
	});

	registerReactionHandler(bot, env);
	registerStarHandler(bot, env);

	return bot;
}
