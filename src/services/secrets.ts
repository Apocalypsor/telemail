import type { Env } from '../types';

export interface TelegramSecrets {
	token: string;
	chatId: string;
}

export async function getTelegramSecrets(env: Env): Promise<TelegramSecrets> {
	const token = await env.TG_TOKEN.get();
	const chatId = env.GMAIL_TELEGRAM_CHAT_ID;
	if (!chatId) {
		throw new Error('GMAIL_TELEGRAM_CHAT_ID is not configured');
	}
	return { token, chatId };
}
