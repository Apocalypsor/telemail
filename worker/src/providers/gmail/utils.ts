import { http } from "@worker/clients/http";
import { GMAIL_API, GOOGLE_OAUTH_TOKEN_URL } from "@worker/constants";
import type { GmailMessage, GmailPayload } from "@worker/providers/gmail/types";
import { refreshAccessToken } from "@worker/providers/utils";
import type { Account, Env, MailAttachmentMeta } from "@worker/types";
import { base64urlToString } from "@worker/utils/base64url";

/** 用 refresh_token 换 access_token（KV 缓存，共用 base.ts 的实现） */
export async function getAccessToken(
  env: Env,
  account: Account,
): Promise<string> {
  return refreshAccessToken(env, account, {
    tokenUrl: GOOGLE_OAUTH_TOKEN_URL,
    clientId: env.GMAIL_CLIENT_ID,
    clientSecret: env.GMAIL_CLIENT_SECRET,
  });
}

/** 调用 Gmail REST API (GET) */
export async function gmailGet<T>(token: string, path: string): Promise<T> {
  return http
    .get(`${GMAIL_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .json() as Promise<T>;
}

/**
 * Gmail Batch API：把 N 个 `messages.get?format=METADATA` 合并成一个 multipart/mixed
 * 请求，整体一次响应解出来。用在 search/list 这类需要批量取 subject/from 的场景，
 * 替代 N 次并发 GET —— 避免 burst rate-limit 触发偶发"无主题"，也省 Workers 子请求配额。
 *
 * 限制：
 *  - Gmail batch 单批上限 100 个 sub-request（调用方自己保证 ≤ 100）。
 *  - sub-request 失败（404 / 5xx / 错误体）会被静默跳过 —— map 里就没那条 id，
 *    调用方按 missing 处理（兜底成 `(无主题)`）。
 *  - 仅 GET / 只读用法是安全的：整个 batch POST 失败就抛，调用方决定是否重试。
 *
 * 实现细节：
 *  - 每个 sub-request 带 Content-ID `<item-N>`；Gmail 回的 sub-response 用
 *    `<response-item-N>` 与之对应，按这个序号映射回原 messageIds。
 *  - 不需要给每个 sub-request 单独写 Authorization —— 外层 POST 的 Bearer 会被继承。
 */
export async function gmailBatchGetMetadata(
  token: string,
  messageIds: string[],
  metadataHeaders: string[],
): Promise<Map<string, GmailMessage>> {
  if (messageIds.length === 0) return new Map();

  const boundary = `batch_${crypto.randomUUID()}`;
  const headerQs = metadataHeaders
    .map((h) => `metadataHeaders=${encodeURIComponent(h)}`)
    .join("&");

  let body = "";
  for (let i = 0; i < messageIds.length; i++) {
    const id = encodeURIComponent(messageIds[i]);
    body += `--${boundary}\r\n`;
    body += `Content-Type: application/http\r\n`;
    body += `Content-ID: <item-${i}>\r\n`;
    body += `\r\n`;
    body += `GET /gmail/v1/users/me/messages/${id}?format=METADATA&${headerQs}\r\n`;
    body += `\r\n`;
  }
  body += `--${boundary}--\r\n`;

  const resp = await http.post("https://www.googleapis.com/batch/gmail/v1", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/mixed; boundary=${boundary}`,
    },
    body,
  });

  // 响应也是 multipart/mixed，boundary 在响应 Content-Type 里。可能是裸或带引号。
  const respCt = resp.headers.get("content-type") ?? "";
  const respBoundaryMatch = respCt.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!respBoundaryMatch) {
    throw new Error("Gmail batch response missing multipart boundary");
  }
  const respBoundary = respBoundaryMatch[1] ?? respBoundaryMatch[2];
  const respText = await resp.text();

  const result = new Map<string, GmailMessage>();
  // 头尾的 preamble / closing("--") 会被自然过滤
  const sections = respText.split(`--${respBoundary}`);
  for (const raw of sections) {
    const section = raw.trim();
    if (!section || section === "--") continue;

    // sub-response 的 Content-ID = 请求里 <item-N> 加 "response-" 前缀
    const cidMatch = section.match(/Content-ID:\s*<response-item-(\d+)>/i);
    if (!cidMatch) continue;
    const idx = Number(cidMatch[1]);
    if (!Number.isInteger(idx) || idx < 0 || idx >= messageIds.length) continue;

    // 段落格式：<part-headers>\r\n\r\n<HTTP/1.1 STATUS\r\n<inner-headers>\r\n\r\n<json>>
    const partHeadersEnd = section.indexOf("\r\n\r\n");
    if (partHeadersEnd === -1) continue;
    const inner = section.slice(partHeadersEnd + 4);
    const innerHeadersEnd = inner.indexOf("\r\n\r\n");
    if (innerHeadersEnd === -1) continue;
    const json = inner.slice(innerHeadersEnd + 4).trim();

    try {
      const parsed = JSON.parse(json) as GmailMessage & { error?: unknown };
      if (parsed.error) continue;
      result.set(messageIds[idx], parsed);
    } catch {
      // 个别段 body 损坏，跳过即可
    }
  }

  return result;
}

/** 调用 Gmail REST API (POST with JSON body) */
export async function gmailPost<T = void>(
  token: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const resp = await http.post(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    json: body,
  });
  const text = await resp.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** 从 Gmail payload headers 中提取指定头部 */
export function extractHeader(
  payload: GmailPayload,
  name: string,
): string | null {
  return (
    payload.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
      ?.value ?? null
  );
}

/** 递归收集内联图片（body.data 已内嵌的情况） */
export function collectInlineParts(
  payload: GmailPayload,
  cidMap: Map<string, string>,
): void {
  if (!payload) return;
  const contentId = extractHeader(payload, "content-id");
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
export function collectInlineAttachmentIds(
  payload: GmailPayload,
  result: { cid: string; mimeType: string; attachmentId: string }[],
): void {
  if (!payload) return;
  const contentId = extractHeader(payload, "content-id");
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

function isInlinePayload(payload: GmailPayload): boolean {
  const disposition = extractHeader(
    payload,
    "content-disposition",
  )?.toLowerCase();
  return (
    disposition?.startsWith("inline") === true ||
    (!!extractHeader(payload, "content-id") &&
      payload.mimeType?.startsWith("image/") === true)
  );
}

export function collectAttachmentMeta(
  payload: GmailPayload,
  result: MailAttachmentMeta[] = [],
): MailAttachmentMeta[] {
  if (!payload) return result;

  const hasAttachmentContent = !!(
    payload.body?.attachmentId || payload.body?.data
  );
  if (hasAttachmentContent && payload.filename && !isInlinePayload(payload)) {
    result.push({
      id: payload.body?.attachmentId ?? String(result.length),
      filename: payload.filename,
      mimeType: payload.mimeType ?? null,
      size: payload.body?.size ?? null,
    });
  }

  if (payload.parts) {
    for (const part of payload.parts) collectAttachmentMeta(part, result);
  }
  return result;
}

export function collectVisibleAttachmentPayloads(
  payload: GmailPayload,
  result: GmailPayload[] = [],
): GmailPayload[] {
  if (!payload) return result;

  const hasAttachmentContent = !!(
    payload.body?.attachmentId || payload.body?.data
  );
  if (hasAttachmentContent && payload.filename && !isInlinePayload(payload)) {
    result.push(payload);
  }

  if (payload.parts) {
    for (const part of payload.parts)
      collectVisibleAttachmentPayloads(part, result);
  }
  return result;
}

export function findAttachmentPayloadById(
  payload: GmailPayload,
  attachmentId: string,
): GmailPayload | null {
  if (!payload) return null;
  if (
    payload.body?.attachmentId === attachmentId &&
    !isInlinePayload(payload)
  ) {
    return payload;
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = findAttachmentPayloadById(part, attachmentId);
      if (found) return found;
    }
  }
  return null;
}

export function findAttachmentPayloadByIndex(
  payload: GmailPayload,
  attachmentId: string,
): GmailPayload | null {
  const index = Number(attachmentId);
  if (!Number.isInteger(index) || index < 0) return null;
  return collectVisibleAttachmentPayloads(payload)[index] ?? null;
}

/** 递归提取 payload 中指定 MIME 类型的内容 */
export function extractPartByMime(
  payload: GmailPayload,
  mimeType: string,
): string | null {
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
