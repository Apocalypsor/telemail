import { http } from "@worker/clients/http";
import { GMAIL_API } from "@worker/constants";
import { base64urlToBytes } from "@worker/utils/base64url";

export const gmailAttachmentDataJsonStream = (
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> => {
  const dataKey = '"data"';
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let state: "find-key" | "find-colon" | "find-value" | "read-data" | "done" =
    "find-key";
  let buffer = "";
  let pendingBase64 = "";
  let closed = false;

  const enqueueBase64 = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    value: string,
    final = false,
  ): boolean => {
    pendingBase64 += value;
    const length = final
      ? pendingBase64.length
      : pendingBase64.length - (pendingBase64.length % 4);
    if (length <= 0) return false;

    const bytes = base64urlToBytes(pendingBase64.slice(0, length));
    pendingBase64 = pendingBase64.slice(length);
    controller.enqueue(bytes);
    return true;
  };

  const processBuffer = (
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): boolean => {
    while (!closed) {
      if (state === "done") {
        closed = true;
        controller.close();
        return false;
      }

      if (state === "find-key") {
        const keyIndex = buffer.indexOf(dataKey);
        if (keyIndex === -1) {
          buffer = buffer.slice(
            Math.max(0, buffer.length - dataKey.length + 1),
          );
          return false;
        }
        buffer = buffer.slice(keyIndex + dataKey.length);
        state = "find-colon";
      }

      if (state === "find-colon") {
        const next = buffer.search(/\S/);
        if (next === -1) {
          buffer = "";
          return false;
        }
        if (buffer[next] !== ":") {
          throw new Error("Gmail attachment response has malformed data field");
        }
        buffer = buffer.slice(next + 1);
        state = "find-value";
      }

      if (state === "find-value") {
        const next = buffer.search(/\S/);
        if (next === -1) {
          buffer = "";
          return false;
        }
        if (buffer[next] !== '"') {
          throw new Error("Gmail attachment response data is not a string");
        }
        buffer = buffer.slice(next + 1);
        state = "read-data";
      }

      if (state === "read-data") {
        const quoteIndex = buffer.indexOf('"');
        if (quoteIndex === -1) {
          const emitted = enqueueBase64(controller, buffer);
          buffer = "";
          return emitted;
        }

        const emitted = enqueueBase64(
          controller,
          buffer.slice(0, quoteIndex),
          true,
        );
        buffer = "";
        state = "done";
        if (emitted) return true;
      }
    }

    return false;
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!closed) {
          if (processBuffer(controller)) return;

          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            if (processBuffer(controller)) return;
            if (!closed) {
              throw new Error("Gmail attachment response missing data");
            }
          } else {
            buffer += decoder.decode(value, { stream: true });
          }
        }
      } catch (err) {
        closed = true;
        await reader.cancel().catch(() => {});
        controller.error(err);
      }
    },
    cancel(reason) {
      closed = true;
      return reader.cancel(reason);
    },
  });
};

export const gmailGetAttachmentDataStream = async (
  token: string,
  messageId: string,
  attachmentId: string,
): Promise<ReadableStream<Uint8Array> | null> => {
  const resp = await http.get(
    `${GMAIL_API}/users/me/messages/${encodeURIComponent(
      messageId,
    )}/attachments/${encodeURIComponent(attachmentId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      throwHttpErrors: false,
    },
  );
  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(
      `Gmail attachment download failed: ${resp.status} ${await resp.text()}`,
    );
  }
  if (!resp.body) return null;
  return gmailAttachmentDataJsonStream(resp.body);
};
