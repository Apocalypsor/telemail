import { marked } from "marked";

const EMAIL_BODY_STYLE = [
  "font-family:Helvetica,Arial,sans-serif",
  "font-size:14px",
  "line-height:1.55",
  "color:#111827",
].join(";");

const escapeHtml = (value: string): string => {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
};

export const markdownToHtml = (markdown: string): string => {
  const html = marked.parse(escapeHtml(markdown.replace(/\r\n/g, "\n")), {
    breaks: true,
    gfm: true,
  }) as string;
  return `<div style="${EMAIL_BODY_STYLE}">${html}</div>`;
};
