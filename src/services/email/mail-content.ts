import { gmailGet } from "@services/email/gmail";
import { base64urlToString } from "@utils/base64url";
import type { CidMap } from "@utils/html";
import type { Address } from "postal-mime";
import type { MailMeta } from "@/types";

export interface FetchMailResult {
  html: string;
  cidMap: CidMap;
  meta: MailMeta;
}

/** 从 Gmail API 获取邮件正文 HTML，优先 HTML，fallback 到纯文本 */
export async function fetchMailContent(
  accessToken: string,
  gmailMessageId: string,
): Promise<FetchMailResult | null> {
  const msg = await gmailGet(
    accessToken,
    `/users/me/messages/${gmailMessageId}?format=full`,
  );
  const meta: MailMeta = {
    subject: extractHeader(msg.payload, "subject"),
    from: extractHeader(msg.payload, "from"),
    to: extractHeader(msg.payload, "to"),
    date: extractHeader(msg.payload, "date"),
  };
  const html = extractPartByMime(msg.payload, "text/html");

  const cidMap: CidMap = new Map();
  collectInlineParts(msg.payload, cidMap);

  // 需要通过附件 API 获取的内联图片
  const pending: { cid: string; mimeType: string; attachmentId: string }[] = [];
  collectInlineAttachmentIds(msg.payload, pending);
  if (pending.length > 0) {
    await Promise.all(
      pending.map(async ({ cid, mimeType, attachmentId }) => {
        const att = await gmailGet(
          accessToken,
          `/users/me/messages/${gmailMessageId}/attachments/${attachmentId}`,
        );
        if (att?.data) {
          // Gmail 返回的是 base64url，转为标准 base64
          const b64 = att.data.replace(/-/g, "+").replace(/_/g, "/");
          cidMap.set(cid, `data:${mimeType};base64,${b64}`);
        }
      }),
    );
  }

  if (html) return { html, cidMap, meta };

  const plain = extractPartByMime(msg.payload, "text/plain");
  if (plain) return { html: wrapPlainText(plain), cidMap, meta };

  return null;
}

/** 从 Gmail payload headers 中提取指定头部 */
function extractHeader(payload: any, name: string): string | null {
  return (
    (payload.headers as any[])?.find(
      (h: any) => h.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? null
  );
}

/** 递归收集内联图片（body.data 已内嵌的情况） */
function collectInlineParts(payload: any, cidMap: CidMap): void {
  if (!payload) return;
  const contentId = (payload.headers as any[])?.find(
    (h: any) => h.name.toLowerCase() === "content-id",
  )?.value;
  if (
    contentId &&
    payload.body?.data &&
    payload.mimeType?.startsWith("image/")
  ) {
    const cid = contentId.replace(/^<|>$/g, "");
    const b64 = payload.body.data.replace(/-/g, "+").replace(/_/g, "/");
    cidMap.set(cid, `data:${payload.mimeType};base64,${b64}`);
  }
  if (payload.parts) {
    for (const part of payload.parts) collectInlineParts(part, cidMap);
  }
}

/** 递归收集需要通过附件 API 获取的内联图片 */
function collectInlineAttachmentIds(
  payload: any,
  result: { cid: string; mimeType: string; attachmentId: string }[],
): void {
  if (!payload) return;
  const contentId = (payload.headers as any[])?.find(
    (h: any) => h.name.toLowerCase() === "content-id",
  )?.value;
  if (
    contentId &&
    !payload.body?.data &&
    payload.body?.attachmentId &&
    payload.mimeType?.startsWith("image/")
  ) {
    result.push({
      cid: contentId.replace(/^<|>$/g, ""),
      mimeType: payload.mimeType,
      attachmentId: payload.body.attachmentId,
    });
  }
  if (payload.parts) {
    for (const part of payload.parts) collectInlineAttachmentIds(part, result);
  }
}

/** 递归提取 payload 中指定 MIME 类型的内容 */
function extractPartByMime(payload: any, mimeType: string): string | null {
  if (!payload) return null;

  if (payload.mimeType === mimeType && payload.body?.data) {
    return base64urlToString(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const content = extractPartByMime(part, mimeType);
      if (content) return content;
    }
  }

  return null;
}

/** 将 PostalMime Address 格式化为可读字符串 */
export function formatAddress(addr: Address): string {
  if (addr.address)
    return addr.name ? `${addr.name} <${addr.address}>` : addr.address;
  return addr.name;
}

/** 将纯文本包裹成可读的 HTML 页面 */
export function wrapPlainText(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:monospace;white-space:pre-wrap;word-break:break-word;max-width:800px;margin:2em auto;padding:0 1em;line-height:1.5;color:#333}</style></head><body>${escaped}</body></html>`;
}
