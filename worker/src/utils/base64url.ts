/** base64url → 原始字节 */
export function base64urlToBytes(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/** base64url → ArrayBuffer */
export function base64urlToArrayBuffer(b64url: string): ArrayBuffer {
  return base64urlToBytes(b64url).buffer as ArrayBuffer;
}

/** base64url → UTF-8 string */
export function base64urlToString(b64url: string): string {
  return new TextDecoder("utf-8").decode(base64urlToBytes(b64url));
}

/** base64url → byte stream，用于避免一次性构造完整附件二进制。 */
export function base64urlToByteStream(
  b64url: string,
): ReadableStream<Uint8Array> {
  const chunkChars = 64 * 1024;
  let offset = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= b64url.length) {
        controller.close();
        return;
      }

      const remaining = b64url.length - offset;
      const take = remaining > chunkChars ? chunkChars : remaining;
      const end = Math.min(offset + take, b64url.length);
      const chunk = b64url.slice(offset, end);
      offset = end;

      controller.enqueue(base64urlToBytes(chunk));

      if (offset >= b64url.length) controller.close();
    },
  });
}

/** 标准 base64 → ArrayBuffer */
export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    .buffer as ArrayBuffer;
}
