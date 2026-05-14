import type { MailAttachmentMeta } from "@worker/types";
import type { Attachment as PostalAttachment } from "postal-mime";

/** 将 HTML 中的 cid:xxx 引用替换为 data URI */
export const replaceCidReferences = (html: string, cidMap: CidMap): string => {
  if (cidMap.size === 0) return html;
  return html.replace(
    /cid:([^"'\s)]+)/gi,
    (match, cid) => cidMap.get(cid) ?? match,
  );
};

/** 从 postal-mime 附件列表中提取 CID 内联图片为 data URI */
export const buildCidMapFromAttachments = (
  attachments: PostalAttachment[],
): CidMap => {
  const cidMap: CidMap = new Map();
  for (const att of attachments) {
    if (att.contentId && att.mimeType.startsWith("image/")) {
      const cid = att.contentId.replace(/^<|>$/g, "");
      const bytes = new Uint8Array(att.content as ArrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++)
        binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);
      cidMap.set(cid, `data:${att.mimeType};base64,${b64}`);
    }
  }
  return cidMap;
};

const attachmentSize = (
  content: PostalAttachment["content"],
): number | null => {
  if (typeof content === "string")
    return new TextEncoder().encode(content).length;
  if (content instanceof ArrayBuffer) return content.byteLength;
  return content.byteLength;
};

const shouldShowAttachment = (att: PostalAttachment): boolean => {
  if (att.related) return false;
  if (att.disposition === "inline" && att.contentId) return false;
  return att.disposition === "attachment" || !!att.filename;
};

export const buildAttachmentMetaFromMime = (
  attachments: PostalAttachment[],
): MailAttachmentMeta[] => {
  return visibleMailAttachments(attachments).map((att, index) => ({
    id: String(index),
    filename: att.filename || null,
    mimeType: att.mimeType || null,
    size: attachmentSize(att.content),
  }));
};

export const visibleMailAttachments = (
  attachments: PostalAttachment[],
): PostalAttachment[] => {
  return attachments.filter(shouldShowAttachment);
};
// ─── CID 内联图片 ────────────────────────────────────────────────────────────

/** CID → data URI 映射 */
type CidMap = Map<string, string>;
