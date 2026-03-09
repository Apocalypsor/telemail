import { Bot } from 'grammy';
import type { Env } from '../types';
import { registerReactionHandler } from './handlers/reaction';
import { registerStarHandler } from './handlers/star';

export { STAR_KEYBOARD, STARRED_KEYBOARD } from './keyboards';

/** 创建 grammY Bot 实例（仅用于 webhook 接收端） */
export function createBot(env: Env) {
	const bot = new Bot(env.TELEGRAM_TOKEN);

	registerReactionHandler(bot, env);
	registerStarHandler(bot, env);

	return bot;
}
