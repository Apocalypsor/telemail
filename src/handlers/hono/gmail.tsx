import { Hono } from 'hono';
import { enqueueSyncNotification } from '../../services/bridge';
import type { AppEnv, PubSubPushBody } from '../../types';
import { requireSecret } from './middleware';
import { ROUTE_GMAIL_PUSH } from './routes';

const gmail = new Hono<AppEnv>();

gmail.post(ROUTE_GMAIL_PUSH, requireSecret('GMAIL_PUSH_SECRET'), async (c) => {
	const body = await c.req.json<PubSubPushBody>();
	await enqueueSyncNotification(body, c.env);
	return c.text('OK');
});

export default gmail;
