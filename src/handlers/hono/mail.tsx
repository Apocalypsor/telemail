import { Hono } from 'hono';
import { getAccountById } from '../../db/accounts';
import { getCachedMailHtml, putCachedMailHtml } from '../../db/kv';
import { getMessageMappingByGmailId } from '../../db/message-map';
import { getAccessToken, gmailGet } from '../../services/gmail';
import type { Env } from '../../types';
import { verifyMailToken } from '../../utils/hash';
import { ROUTE_MAIL } from './routes';

const mail = new Hono<{ Bindings: Env }>();

/** 从 Gmail API 获取邮件的 HTML 正文 */
async function fetchMailHtml(accessToken: string, gmailMessageId: string): Promise<string | null> {
	const msg = await gmailGet(accessToken, `/users/me/messages/${gmailMessageId}?format=full`);
	return extractHtmlFromPayload(msg.payload);
}

/** 递归提取 payload 中的 text/html 部分 */
function extractHtmlFromPayload(payload: any): string | null {
	if (!payload) return null;

	if (payload.mimeType === 'text/html' && payload.body?.data) {
		return decodeBase64Url(payload.body.data);
	}

	if (payload.parts) {
		for (const part of payload.parts) {
			const html = extractHtmlFromPayload(part);
			if (html) return html;
		}
	}

	return null;
}

function decodeBase64Url(b64url: string): string {
	let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
	while (b64.length % 4) b64 += '=';
	return atob(b64);
}

mail.get(ROUTE_MAIL, async (c) => {
	const gmailMessageId = c.req.param('id');
	const token = c.req.query('t');

	if (!token) return c.text('Missing token', 400);

	// 查找消息映射以获取 chatId 和 accountId
	const mapping = await getMessageMappingByGmailId(c.env.DB, gmailMessageId);
	if (!mapping) return c.text('Message not found', 404);

	// 验证 HMAC token
	const valid = await verifyMailToken(c.env.GMAIL_WATCH_SECRET, gmailMessageId, mapping.tg_chat_id, token);
	if (!valid) return c.text('Forbidden', 403);

	// 尝试从 KV 缓存读取
	const cached = await getCachedMailHtml(c.env, gmailMessageId);
	if (cached) {
		return c.html(cached);
	}

	// 从 Gmail API 实时获取
	const account = await getAccountById(c.env.DB, mapping.account_id);
	if (!account || !account.refresh_token) return c.text('Account not authorized', 403);

	const accessToken = await getAccessToken(c.env, account);
	const html = await fetchMailHtml(accessToken, gmailMessageId);

	if (!html) return c.text('No HTML content in this email', 404);

	// 缓存到 KV（7 天）
	await putCachedMailHtml(c.env, gmailMessageId, html);

	return c.html(html);
});

export default mail;
