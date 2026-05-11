export function contentDisposition(filename: string | null): string {
  const fallback = (filename || "attachment").replace(/[^\w. -]/g, "_");
  const quoted = fallback.replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename || "attachment");
  return `attachment; filename="${quoted}"; filename*=UTF-8''${encoded}`;
}
