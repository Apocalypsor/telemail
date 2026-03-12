import { Hono } from 'hono';
import PostalMime from 'postal-mime';
import { getAccountByEmail } from '../../db/accounts';
import { getCachedMailHtml, putCachedMailHtml } from '../../db/kv';
import { getAccessToken } from '../../services/email/gmail';
import { fetchImapRawEmail } from '../../services/email/imap/bridge';
import { fetchMailContent, wrapPlainText } from '../../services/mail-content';
import { AccountType, type AppEnv } from '../../types';
import { base64ToArrayBuffer } from '../../utils/base64url';
import { verifyMailToken } from '../../utils/hash';
import { ROUTE_MAIL } from './routes';

const mail = new Hono<AppEnv>();

mail.get(ROUTE_MAIL, async (c) => {
	const messageId = c.req.param('id');
	const token = c.req.query('t');
	const chatId = c.req.query('chatId');
	const accountEmail = c.req.query('email');

	if (!token || !chatId || !accountEmail) return c.text('Missing params', 400);

	const valid = await verifyMailToken(c.env.ADMIN_SECRET, messageId, accountEmail, chatId, token);
	if (!valid) return c.text('Forbidden', 403);

	// KV 缓存（Gmail 和 IMAP 共用）
	const cached = await getCachedMailHtml(c.env, messageId);
	if (cached) return c.html(cached);

	const account = await getAccountByEmail(c.env.DB, accountEmail);
	if (!account || account.chat_id !== chatId) return c.text('Account not found', 404);

	let html: string | null = null;

	if (account.type === AccountType.Imap) {
		const base64 = await fetchImapRawEmail(c.env, account.id, messageId);
		const email = await new PostalMime().parse(base64ToArrayBuffer(base64));
		html = email.html ?? (email.text ? wrapPlainText(email.text) : null);
	} else {
		if (!account.refresh_token) return c.text('Account not authorized', 403);
		const accessToken = await getAccessToken(c.env, account);
		html = await fetchMailContent(accessToken, messageId);
	}

	if (!html) return c.text('No content in this email', 404);

	await putCachedMailHtml(c.env, messageId, html);
	return c.html(html);
});

export default mail;
