import { http } from "@worker/clients/http";
import { MS_GRAPH_API } from "@worker/constants";
import type {
  GraphAttachment,
  GraphAttachmentList,
} from "@worker/providers/outlook/types";
import type { MailAttachmentMeta } from "@worker/types";

const isDownloadableAttachment = (attachment: GraphAttachment): boolean => {
  const type = attachment["@odata.type"]?.toLowerCase() ?? "";
  return (
    type === "#microsoft.graph.fileattachment" ||
    type === "#microsoft.graph.itemattachment" ||
    type === ""
  );
};

const isVisibleAttachment = (attachment: GraphAttachment): boolean => {
  return (
    !!attachment.id &&
    !attachment.isInline &&
    !!attachment.name &&
    isDownloadableAttachment(attachment)
  );
};

export const listOutlookAttachments = async (
  token: string,
  messageId: string,
): Promise<GraphAttachment[]> => {
  let url: string | null =
    `${MS_GRAPH_API}/me/messages/${encodeURIComponent(messageId)}/attachments`;
  const result: GraphAttachment[] = [];
  let firstPage = true;

  while (url) {
    const data: GraphAttachmentList = await http
      .get(url, {
        headers: { Authorization: `Bearer ${token}` },
        ...(firstPage && {
          searchParams: {
            $select: "id,name,contentType,size,isInline",
          },
        }),
      })
      .json<GraphAttachmentList>();
    result.push(...(data.value ?? []));
    url = data["@odata.nextLink"] ?? null;
    firstPage = false;
  }

  return result.filter(isVisibleAttachment);
};

export const buildOutlookAttachmentMeta = async (
  token: string,
  messageId: string,
): Promise<MailAttachmentMeta[]> => {
  const attachments = await listOutlookAttachments(token, messageId);
  return attachments.map((attachment, index) => ({
    id: attachment.id || String(index),
    filename: attachment.name ?? null,
    mimeType: attachment.contentType ?? null,
    size: attachment.size ?? null,
  }));
};

const fetchAttachmentValue = async (
  token: string,
  messageId: string,
  attachmentId: string,
): Promise<Response> => {
  return http.get(
    `${MS_GRAPH_API}/me/messages/${encodeURIComponent(
      messageId,
    )}/attachments/${encodeURIComponent(attachmentId)}/$value`,
    {
      headers: { Authorization: `Bearer ${token}` },
      throwHttpErrors: false,
    },
  );
};

export const fetchOutlookAttachmentStream = async (
  token: string,
  messageId: string,
  attachmentId: string,
): Promise<{
  attachment: GraphAttachment;
  body: ReadableStream<Uint8Array>;
} | null> => {
  const attachments = await listOutlookAttachments(token, messageId);
  const index = Number(attachmentId);
  const attachment =
    attachments.find((item) => item.id === attachmentId) ??
    (Number.isInteger(index) && index >= 0 ? attachments[index] : undefined);
  if (!attachment) return null;

  const resp = await fetchAttachmentValue(token, messageId, attachment.id);
  if (resp.status === 404 || resp.status === 405) return null;
  if (!resp.ok) {
    throw new Error(
      `Outlook attachment download failed: ${resp.status} ${await resp.text()}`,
    );
  }
  if (!resp.body) return null;
  return { attachment, body: resp.body };
};
