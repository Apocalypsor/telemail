import type { Env } from '../types';
import { getTelegramSecrets } from './secrets';
import { sendPlainTextMessage } from './telegram';

type ErrorContext = Record<string, unknown>;

export async function reportErrorToObservabilityAndTelegram(
	env: Env,
	event: string,
	error: unknown,
	context: ErrorContext = {},
): Promise<void> {
	logError(event, error, context);
	await notifyErrorToTelegram(env, event, error, context);
}

export function logError(event: string, error: unknown, context: ErrorContext = {}): void {
	const message = error instanceof Error ? error.message : String(error);
	const stack = error instanceof Error ? error.stack : undefined;
	console.error({
		level: 'error',
		event,
		message,
		stack,
		timestamp: new Date().toISOString(),
		...context,
	});
}

async function notifyErrorToTelegram(env: Env, event: string, error: unknown, context: ErrorContext): Promise<void> {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const contextText = safeJSONStringify(context);
	const text = [
		'[Bridge Error]',
		`event: ${event}`,
		`time: ${new Date().toISOString()}`,
		`message: ${errorMessage}`,
		contextText ? `context: ${contextText}` : '',
	]
		.filter(Boolean)
		.join('\n')
		.slice(0, 3900);

	try {
		const { token, chatId } = await getTelegramSecrets(env);
		await sendPlainTextMessage(token, chatId, text);
	} catch (notifyError: unknown) {
		const message = notifyError instanceof Error ? notifyError.message : String(notifyError);
		console.error({
			level: 'error',
			event: 'error_notification_failed',
			message,
			original_event: event,
			timestamp: new Date().toISOString(),
		});
	}
}

function safeJSONStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return '[unserializable-context]';
	}
}
