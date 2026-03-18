import type { Attachment } from 'postal-mime';
import { ROUTE_CORS_PROXY } from '@handlers/hono/routes';

/** CID → data URI 映射 */
export type CidMap = Map<string, string>;

/** 将 HTML 中的 cid:xxx 引用替换为 data URI */
export function replaceCidReferences(html: string, cidMap: CidMap): string {
	if (cidMap.size === 0) return html;
	return html.replace(/cid:([^"'\s)]+)/gi, (match, cid) => cidMap.get(cid) ?? match);
}

/** 将 HTML 中的外部图片 URL 改写为经由 CORS 代理 */
export function proxyImages(html: string): string {
	return html.replace(
		/(<img\b[^>]*?\bsrc\s*=\s*)(["'])(https?:\/\/[^"']+)\2/gi,
		(_, before, quote, url) => `${before}${quote}${ROUTE_CORS_PROXY}?url=${encodeURIComponent(url)}${quote}`,
	);
}

/** 从 postal-mime 附件列表中提取 CID 内联图片为 data URI */
export function buildCidMapFromAttachments(attachments: Attachment[]): CidMap {
	const cidMap: CidMap = new Map();
	for (const att of attachments) {
		if (att.contentId && att.mimeType.startsWith('image/')) {
			const cid = att.contentId.replace(/^<|>$/g, '');
			const bytes = new Uint8Array(att.content as ArrayBuffer);
			const b64 = btoa(String.fromCharCode(...bytes));
			cidMap.set(cid, `data:${att.mimeType};base64,${b64}`);
		}
	}
	return cidMap;
}
