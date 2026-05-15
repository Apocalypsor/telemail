import { marked } from "marked";

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
  return marked.parse(escapeHtml(markdown.replace(/\r\n/g, "\n")), {
    breaks: true,
    gfm: true,
  }) as string;
};
