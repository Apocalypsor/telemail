import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../../types';

/** 校验 query param 中的共享密钥（仅用于 GMAIL_PUSH_SECRET） */
export function requireSecret(secretKey: 'GMAIL_PUSH_SECRET'): MiddlewareHandler<AppEnv> {
	return async (c, next) => {
		if (c.req.query('secret') !== c.env[secretKey]) {
			return c.text('Forbidden', 403);
		}
		await next();
	};
}
