import type { GmailPayload } from "@worker/providers/gmail/types";
import type { MailAttachmentMeta } from "@worker/types";
import { base64urlToString } from "@worker/utils/base64url";

/** 从 Gmail payload headers 中提取指定头部 */
export const extractHeader = (
  payload: GmailPayload,
  name: string,
): string | null => {
  return (
    payload.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
      ?.value ?? null
  );
};

/** 递归收集内联图片（body.data 已内嵌的情况） */
export const collectInlineParts = (
  payload: GmailPayload,
  cidMap: Map<string, string>,
): void => {
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
};

/** 递归收集需要通过附件 API 获取的内联图片 */
export const collectInlineAttachmentIds = (
  payload: GmailPayload,
  result: { cid: string; mimeType: string; attachmentId: string }[],
): void => {
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
};

const isInlinePayload = (payload: GmailPayload): boolean => {
  const disposition = extractHeader(
    payload,
    "content-disposition",
  )?.toLowerCase();
  if (disposition?.startsWith("attachment")) return false;
  return (
    disposition?.startsWith("inline") === true ||
    (!!extractHeader(payload, "content-id") &&
      payload.mimeType?.startsWith("image/") === true)
  );
};

export const collectAttachmentMeta = (
  payload: GmailPayload,
  result: MailAttachmentMeta[] = [],
): MailAttachmentMeta[] => {
  if (!payload) return result;

  const hasAttachmentContent = !!(
    payload.body?.attachmentId || payload.body?.data
  );
  if (hasAttachmentContent && payload.filename && !isInlinePayload(payload)) {
    result.push({
      id: String(result.length),
      filename: payload.filename,
      mimeType: payload.mimeType ?? null,
      size: payload.body?.size ?? null,
    });
  }

  if (payload.parts) {
    for (const part of payload.parts) collectAttachmentMeta(part, result);
  }
  return result;
};

export const collectVisibleAttachmentPayloads = (
  payload: GmailPayload,
  result: GmailPayload[] = [],
): GmailPayload[] => {
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
};

export const findAttachmentPayloadById = (
  payload: GmailPayload,
  attachmentId: string,
): GmailPayload | null => {
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
};

export const findAttachmentPayloadByIndex = (
  payload: GmailPayload,
  attachmentId: string,
): GmailPayload | null => {
  const index = Number(attachmentId);
  if (!Number.isInteger(index) || index < 0) return null;
  return collectVisibleAttachmentPayloads(payload)[index] ?? null;
};

/** 递归提取 payload 中指定 MIME 类型的内容 */
export const extractPartByMime = (
  payload: GmailPayload,
  mimeType: string,
): string | null => {
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
};
