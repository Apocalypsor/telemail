import { createHmac } from 'node:crypto';

/** 常量时间字符串比较，防止计时攻击 */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	const enc = new TextEncoder();
	const bufA = enc.encode(a);
	const bufB = enc.encode(b);
	let diff = 0;
	for (let i = 0; i < bufA.length; i++) {
		diff |= bufA[i] ^ bufB[i];
	}
	return diff === 0;
}

/** 生成邮件查看链接的 HMAC-SHA256 token */
export async function generateMailToken(secret: string, messageId: string, accountEmail: string, chatId: string): Promise<string> {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const data = new TextEncoder().encode(`${messageId}:${accountEmail}:${chatId}`);
	const sig = await crypto.subtle.sign('HMAC', key, data);
	return Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
		.slice(0, 32);
}

/** 验证邮件查看链接的 token */
export async function verifyMailToken(
	secret: string,
	messageId: string,
	accountEmail: string,
	chatId: string,
	token: string,
): Promise<boolean> {
	const expected = await generateMailToken(secret, messageId, accountEmail, chatId);
	return timingSafeEqual(expected, token);
}

/** 为 CORS 代理 URL 生成 HMAC-SHA256 签名（同步） */
export function signProxyUrl(secret: string, url: string): string {
	return createHmac('sha256', secret).update(url).digest('hex').slice(0, 32);
}

/** 验证 CORS 代理 URL 签名 */
export function verifyProxySignature(secret: string, url: string, signature: string): boolean {
	return timingSafeEqual(signProxyUrl(secret, url), signature);
}
