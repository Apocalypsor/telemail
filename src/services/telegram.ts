import type { Attachment } from '../types';

/** Telegram sendMessage 字符上限 */
export const TG_MSG_LIMIT = 4096;
/** Telegram caption 字符上限 (sendDocument / sendMediaGroup) */
export const TG_CAPTION_LIMIT = 1024;

function isEntityParseError(description: string | undefined): boolean {
	return !!description && /can't parse entities/i.test(description);
}

function markdownV2ToPlainText(text: string): string {
	let out = text;
	out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1: $2');
	out = out.replace(/\\([_*\[\]()~`>#+\-=|{}.!\\])/g, '$1');
	return out;
}

function extractTelegramDescription(payload: unknown): string {
	if (!payload || typeof payload !== 'object' || !('description' in payload)) return 'Unknown Telegram error';
	const desc = (payload as { description?: unknown }).description;
	return typeof desc === 'string' ? desc : 'Unknown Telegram error';
}

/** 发送纯文本消息（不使用 parse_mode） */
export async function sendPlainTextMessage(token: string, chatId: string, text: string): Promise<void> {
	const url = `https://api.telegram.org/bot${token}/sendMessage`;
	const resp = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ chat_id: chatId, text }),
	});
	if (!resp.ok) {
		const err = (await resp.json()) as unknown;
		throw new Error(`TG sendMessage plain ${resp.status}: ${extractTelegramDescription(err)}`);
	}
}

/** 发送纯文字消息 */
export async function sendTextMessage(token: string, chatId: string, text: string): Promise<void> {
	const url = `https://api.telegram.org/bot${token}/sendMessage`;
	const resp = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2' }),
	});
	if (!resp.ok) {
		const err = (await resp.json()) as unknown;
		const errDescription = extractTelegramDescription(err);
		console.error('TG sendMessage failed payload:', {
			chatId,
			textLength: text.length,
			description: errDescription,
		});
		if (isEntityParseError(errDescription)) {
			const plain = markdownV2ToPlainText(text);
			console.warn('TG sendMessage parse_mode failed, retrying as plain text');
			await sendPlainTextMessage(token, chatId, plain);
			return;
		}
		throw new Error(`TG sendMessage ${resp.status}: ${errDescription}`);
	}
}

function attToBlob(att: Attachment): Blob {
	const mime = att.mimeType || 'application/octet-stream';
	return typeof att.content === 'string'
		? new Blob([new TextEncoder().encode(att.content)], { type: mime })
		: new Blob([att.content], { type: mime });
}

/**
 * 发送消息 + 附件合并在一条 Telegram 消息中。
 * - 1 个附件: sendDocument + caption
 * - 多个附件: sendMediaGroup，caption 放第一个文件上
 */
export async function sendWithAttachments(token: string, chatId: string, caption: string, attachments: Attachment[]): Promise<void> {
	try {
		if (attachments.length === 1) {
			const att = attachments[0];
			const blob = attToBlob(att);
			const form = new FormData();
			form.append('chat_id', chatId);
			form.append('document', blob, att.filename || 'attachment');
			form.append('caption', caption);
			form.append('parse_mode', 'MarkdownV2');

			const url = `https://api.telegram.org/bot${token}/sendDocument`;
			const resp = await fetch(url, { method: 'POST', body: form });
			if (!resp.ok) {
				const err = (await resp.json()) as any;
				console.error('TG sendDocument failed payload:', {
					chatId,
					captionLength: caption.length,
					filename: att.filename || 'attachment',
					description: err?.description,
				});
				if (isEntityParseError(err?.description)) {
					console.warn('TG sendDocument parse_mode failed, retrying as plain caption');
					const fallbackForm = new FormData();
					fallbackForm.append('chat_id', chatId);
					fallbackForm.append('document', blob, att.filename || 'attachment');
					fallbackForm.append('caption', markdownV2ToPlainText(caption));
					const fallbackResp = await fetch(url, { method: 'POST', body: fallbackForm });
					if (fallbackResp.ok) return;
					const fallbackErr = (await fallbackResp.json()) as any;
					throw new Error(`TG sendDocument fallback ${fallbackResp.status}: ${fallbackErr.description}`);
				}
				throw new Error(`TG sendDocument ${resp.status}: ${err.description}`);
			}
		} else {
			const form = new FormData();
			form.append('chat_id', chatId);

			const media = attachments.map((att, i) => {
				const fieldName = `file${i}`;
				const blob = attToBlob(att);
				form.append(fieldName, blob, att.filename || `attachment_${i + 1}`);

				const entry: Record<string, string> = {
					type: 'document',
					media: `attach://${fieldName}`,
				};
				if (i === 0) {
					entry.caption = caption;
					entry.parse_mode = 'MarkdownV2';
				}
				return entry;
			});

			form.append('media', JSON.stringify(media));

			const url = `https://api.telegram.org/bot${token}/sendMediaGroup`;
			const resp = await fetch(url, { method: 'POST', body: form });
			if (!resp.ok) {
				const err = (await resp.json()) as any;
				console.error('TG sendMediaGroup failed payload:', {
					chatId,
					captionLength: caption.length,
					attachments: attachments.length,
					description: err?.description,
				});
				if (isEntityParseError(err?.description)) {
					console.warn('TG sendMediaGroup parse_mode failed, retrying as plain caption');
					const fallbackForm = new FormData();
					fallbackForm.append('chat_id', chatId);
					const fallbackMedia = attachments.map((att, i) => {
						const fieldName = `file${i}`;
						const blob = attToBlob(att);
						fallbackForm.append(fieldName, blob, att.filename || `attachment_${i + 1}`);
						const entry: Record<string, string> = {
							type: 'document',
							media: `attach://${fieldName}`,
						};
						if (i === 0) {
							entry.caption = markdownV2ToPlainText(caption);
						}
						return entry;
					});
					fallbackForm.append('media', JSON.stringify(fallbackMedia));
					const fallbackResp = await fetch(url, { method: 'POST', body: fallbackForm });
					if (fallbackResp.ok) return;
					const fallbackErr = (await fallbackResp.json()) as any;
					throw new Error(`TG sendMediaGroup fallback ${fallbackResp.status}: ${fallbackErr.description}`);
				}
				throw new Error(`TG sendMediaGroup ${resp.status}: ${err.description}`);
			}
		}
	} catch (e: any) {
		throw new Error(`发送附件消息异常: ${e.message}`);
	}
}
