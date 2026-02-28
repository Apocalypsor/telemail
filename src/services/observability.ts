import { escapeMdV2 } from '../lib/markdown-v2';
import type { Env } from '../types';
import { getTelegramSecrets } from './secrets';
import { sendTextMessage } from './telegram';

type ErrorContext = Record<string, unknown>;

export async function reportErrorToObservabilityAndTelegram(
	env: Env,
	event: string,
	error: unknown,
	context: ErrorContext = {},
): Promise<void> {
	try {
		logError(env, event, error, context);
		await notifyErrorToTelegram(env, event, error, context);
	} catch (reportError: unknown) {
		const workerName = resolveWorkerName(env);
		const message = reportError instanceof Error ? reportError.message : String(reportError);
		console.error({
			level: 'error',
			event: 'error_reporting_failed',
			title: `[${workerName}] error_reporting_failed`,
			worker_name: workerName,
			message,
			original_event: event,
			timestamp: new Date().toISOString(),
		});
	}
}

export function logError(env: Env, event: string, error: unknown, context: ErrorContext = {}): void {
	const message = error instanceof Error ? error.message : String(error);
	const stack = error instanceof Error ? error.stack : undefined;
	const workerName = resolveWorkerName(env);
	console.error({
		level: 'error',
		event,
		title: `[${workerName}] ${event}`,
		worker_name: workerName,
		message,
		stack,
		timestamp: new Date().toISOString(),
		...context,
	});
}

async function notifyErrorToTelegram(env: Env, event: string, error: unknown, context: ErrorContext): Promise<void> {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const contextText = safeJSONStringify(context);
	const workerName = resolveWorkerName(env);
	const text = [
		`*${escapeMdV2(`[Workers Error] ${workerName}`)}*`,
		`*event:* ${escapeMdV2(event)}`,
		`*time:* ${escapeMdV2(new Date().toISOString())}`,
		`*message:* ${escapeMdV2(errorMessage)}`,
		contextText ? `*context:* ${escapeMdV2(contextText)}` : '',
	]
		.filter(Boolean)
		.join('\n')
		.slice(0, 3900);

	try {
		const { token, chatId } = await getTelegramSecrets(env);
		await sendTextMessage(token, chatId, text);
	} catch (notifyError: unknown) {
		const message = notifyError instanceof Error ? notifyError.message : String(notifyError);
		console.error({
			level: 'error',
			event: 'error_notification_failed',
			title: `[${workerName}] error_notification_failed`,
			worker_name: workerName,
			message,
			original_event: event,
			timestamp: new Date().toISOString(),
		});
	}
}

function resolveWorkerName(env: Env): string {
	return env.WORKER_NAME || 'unknown-worker';
}

function safeJSONStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return '[unserializable-context]';
	}
}
