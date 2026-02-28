import { processMessageNotification, processSyncNotification } from '../services/bridge';
import type { Env, QueueMessage } from '../types';

/** Queue consumer: 串行处理邮件，内置重试 */
export async function handleQueueBatch(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
	for (const msg of batch.messages) {
		try {
			if (msg.body.type === 'sync') {
				await processSyncNotification(msg.body, env);
			} else {
				await processMessageNotification(msg.body.messageId, env);
			}
			msg.ack();
		} catch (error: unknown) {
			logQueueError(msg, error);
			msg.retry();
		}
	}
}

function logQueueError(msg: Message<QueueMessage>, error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`处理队列消息失败 (第 ${msg.attempts} 次):`, {
		type: msg.body.type,
		messageId: msg.body.type === 'message' ? msg.body.messageId : undefined,
		pubsubMessageId: msg.body.type === 'sync' ? msg.body.pubsubMessageId : undefined,
		error: message,
	});
}
