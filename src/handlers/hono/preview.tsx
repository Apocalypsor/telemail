import { Hono } from 'hono';
import { PreviewPage } from '../../components/home';
import { formatBody } from '../../utils/format';
import type { Env } from '../../types';
import { requireSecret } from './middleware';
import { ROUTE_PREVIEW } from './routes';

const preview = new Hono<{ Bindings: Env }>();

preview.get(ROUTE_PREVIEW, requireSecret('ADMIN_SECRET'), (c) => {
	return c.html(<PreviewPage secret={c.env.ADMIN_SECRET} />);
});

preview.post(ROUTE_PREVIEW, requireSecret('ADMIN_SECRET'), async (c) => {
	const { html } = await c.req.json<{ html?: string }>();
	if (!html) return c.json({ result: '', length: 0 });
	const result = formatBody(undefined, html, 4000);
	return c.json({ result, length: result.length });
});

export default preview;
