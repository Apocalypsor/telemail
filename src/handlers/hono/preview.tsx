import { Hono } from 'hono';
import { MAX_BODY_CHARS } from '../../constants';
import { PreviewPage } from '../../components/preview';
import { formatBody } from '../../utils/format';
import type { AppEnv } from '../../types';
import { ROUTE_PREVIEW, ROUTE_PREVIEW_API } from './routes';

const preview = new Hono<AppEnv>();

preview.get(ROUTE_PREVIEW, (c) => {
	return c.html(<PreviewPage />);
});

preview.post(ROUTE_PREVIEW_API, async (c) => {
	const { html } = await c.req.json<{ html?: string }>();
	if (!html) return c.json({ result: '', length: 0 });
	const result = formatBody(undefined, html, MAX_BODY_CHARS);
	return c.json({ result, length: result.length });
});

export default preview;
