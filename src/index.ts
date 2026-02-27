import PostalMime from 'postal-mime';
import { escapeMdV2, formatBody } from './format';
import { base64urlToArrayBuffer, fetchNewMessageIds, getAccessToken, gmailGet, KV_HISTORY_ID, renewWatch } from './gmail';
import { sendTextMessage, sendWithAttachments, TG_CAPTION_LIMIT, TG_MSG_LIMIT } from './telegram';
import type { Env, GmailNotification, PubSubPushBody, QueueMessage } from './types';

export type { Env } from './types';
const KV_PROCESSED_PREFIX = 'processed_message:';
const PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 30;

// ─── Worker 入口 ─────────────────────────────────────────────────────────────

export default {
	/**
	 * HTTP handler:
	 *   POST /gmail/push?secret=XXX  — 接收 Pub/Sub 推送
	 *   POST /gmail/watch            — 手动触发 watch 注册
	 *   GET  /                        — 健康检查
	 */
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'POST' && url.pathname === '/gmail/push') {
			if (url.searchParams.get('secret') !== env.GMAIL_PUSH_SECRET) {
				return new Response('Forbidden', { status: 403 });
			}
			const body = (await request.json()) as PubSubPushBody;
			await enqueueSyncNotification(body, env);
			return new Response('OK');
		}

		if (request.method === 'POST' && url.pathname === '/gmail/watch') {
			if (url.searchParams.get('secret') !== env.GMAIL_WATCH_SECRET) {
				return new Response('Forbidden', { status: 403 });
			}
			try {
				await renewWatch(env);
				return new Response('Watch renewed');
			} catch (e: any) {
				return new Response(`Watch failed: ${e.message}`, { status: 500 });
			}
		}

		return new Response('Gmail → Telegram Bridge is running');
	},

	/**
	 * Queue consumer: 串行处理邮件，内置重试
	 */
	async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
		for (const msg of batch.messages) {
			try {
				if (msg.body.type === 'sync') {
					await processSyncNotification(msg.body, env);
				} else {
					await processQueueMessage(msg.body.messageId, env);
				}
				msg.ack();
			} catch (e: any) {
				console.error(`处理队列消息失败 (第 ${msg.attempts} 次):`, {
					type: msg.body.type,
					messageId: msg.body.type === 'message' ? msg.body.messageId : undefined,
					pubsubMessageId: msg.body.type === 'sync' ? msg.body.pubsubMessageId : undefined,
					error: e.message,
				});
				msg.retry();
			}
		}
	},

	/**
	 * Cron handler: 每 6 天自动续订 Gmail watch
	 */
	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(renewWatch(env));
	},
};

// ─── Pub/Sub → Queue 生产者 ─────────────────────────────────────────────────

/** 解析 Pub/Sub 通知，将同步任务入队（串行消费） */
async function enqueueSyncNotification(body: PubSubPushBody, env: Env): Promise<void> {
	const decoded: GmailNotification = JSON.parse(atob(body.message.data));
	console.log(`Pub/Sub notification: email=${decoded.emailAddress}, historyId=${decoded.historyId}`);

	await env.EMAIL_QUEUE.send({
		type: 'sync',
		pubsubMessageId: body.message.messageId,
		historyId: decoded.historyId,
	});
}

/** 串行处理 Gmail history 同步，并将新 message id 入队 */
async function processSyncNotification(sync: Extract<QueueMessage, { type: 'sync' }>, env: Env): Promise<void> {
	const token = await getAccessToken(env);
	const storedHistoryId = await env.EMAIL_KV.get(KV_HISTORY_ID);

	if (!storedHistoryId) {
		await env.EMAIL_KV.put(KV_HISTORY_ID, sync.historyId);
		console.log('Initialized historyId:', sync.historyId);
		return;
	}

	const messageIds = await fetchNewMessageIds(token, env, storedHistoryId);

	if (messageIds.length === 0) {
		console.log('无新邮件');
		return;
	}

	console.log(`发现 ${messageIds.length} 封新邮件，入队`);
	await env.EMAIL_QUEUE.sendBatch(messageIds.map((id) => ({ body: { type: 'message', messageId: id } })));
}

/** 串行消费消息 + 幂等防重 */
async function processQueueMessage(messageId: string, env: Env): Promise<void> {
	const dedupeKey = `${KV_PROCESSED_PREFIX}${messageId}`;
	const processed = await env.EMAIL_KV.get(dedupeKey);
	if (processed) {
		console.log(`跳过重复消息: ${messageId}`);
		return;
	}

	const token = await getAccessToken(env);
	await processGmailMessage(token, messageId, env);

	await env.EMAIL_KV.put(dedupeKey, '1', {
		expirationTtl: PROCESSED_TTL_SECONDS,
	});
}

// ─── 邮件处理（Queue consumer 调用）──────────────────────────────────────────

/** 获取单封 Gmail 邮件（raw 格式），解析并发送到 Telegram */
async function processGmailMessage(token: string, messageId: string, env: Env): Promise<void> {
	const { TG_TOKEN, CHAT_ID } = env;

	const msg = await gmailGet(token, `/users/me/messages/${messageId}?format=raw`);
	const rawEmail = base64urlToArrayBuffer(msg.raw);

	const parser = new PostalMime();
	const email = await parser.parse(rawEmail);

	const from = email.from?.address || '未知';
	const fromName = email.from?.name || '';
	const subject = email.subject || '无主题';
	const date = new Date().toLocaleString('zh-CN', { timeZone: 'America/New_York' });

	const hasAttachments = email.attachments && email.attachments.length > 0;
	const charLimit = hasAttachments ? TG_CAPTION_LIMIT : TG_MSG_LIMIT;

	const header = [
		`*发件人:*  ${escapeMdV2(`${fromName} <${from}>`)}`,
		`*时  间:*  ${escapeMdV2(date)}`,
		`*主  题:*  ${escapeMdV2(subject)}`,
		``,
		``,
	].join('\n');

	const overhead = header.length + 40;
	const bodyBudget = Math.max(charLimit - overhead, 100);

	const body = formatBody(email.text, email.html, bodyBudget);
	const text = header + body;

	if (hasAttachments) {
		await sendWithAttachments(TG_TOKEN, CHAT_ID, text, email.attachments!);
	} else {
		await sendTextMessage(TG_TOKEN, CHAT_ID, text);
	}
}
