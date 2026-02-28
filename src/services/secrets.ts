import type { Env } from '../types';

export interface TelegramSecrets {
	token: string;
	chatId: string;
}

export async function getTelegramSecrets(env: Env): Promise<TelegramSecrets> {
	const [token, chatId] = await Promise.all([env.TG_TOKEN.get(), env.CHAT_ID.get()]);
	return { token, chatId };
}
