export function contentDisposition(filename: string | null): string {
  const fallback = (filename || "attachment").replace(/[^\w. -]/g, "_");
  const quoted = fallback.replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename || "attachment");
  return `attachment; filename="${quoted}"; filename*=UTF-8''${encoded}`;
}

export function attachmentBody(
  content: string | ArrayBuffer | Uint8Array,
): Blob {
  const part =
    typeof content === "string" ? new TextEncoder().encode(content) : content;
  return new Blob([part as unknown as ArrayBuffer], {
    type: "application/octet-stream",
  });
}
