import {
  escapeMdV2,
  findLongestValidMdV2Prefix,
  markdownToMdV2,
} from "@worker/utils/markdown-v2";
import { escapeHtmlText, stripHtmlTags } from "@worker/utils/string";
import { parseHTML } from "linkedom";
import type { Address } from "postal-mime";
import TurndownService from "turndown";

/**
 * 解 quoted-printable —— 先去掉 `=\n` 软换行，再把每段连续的 `=XX=YY...`
 * 收成字节序列、按 UTF-8 解码。逐字节 `String.fromCharCode` 会把多字节序列
 * 炸成 mojibake（`=C2=A9` → `Â©` 而不是 `©`），别走那条路。
 */
const decodeQuotedPrintable = (input: string): string => {
  return input
    .replace(/=\r?\n/g, "")
    .replace(/(?:=[0-9A-Fa-f]{2})+/g, (run) => {
      const bytes = new Uint8Array(run.length / 3);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Number.parseInt(run.substr(i * 3 + 1, 2), 16);
      }
      return utf8Decoder.decode(bytes);
    });
};

export const htmlToMarkdown = (html: string): string => {
  // Fallback: decode quoted-printable if the MIME parser left it un-decoded
  if (html.includes("=3D")) html = decodeQuotedPrintable(html);

  // linkedom can't handle orphan elements between <!doctype> and <html>;
  // they cause document.body to be empty. Strip them before parsing.
  const htmlTagIdx = html.search(/<html[\s>]/i);
  if (htmlTagIdx > 0) html = html.substring(htmlTagIdx);
  else if (htmlTagIdx < 0) html = `<html><body>${html}</body></html>`;
  html = stripPreHeadNodes(html);

  const { document } = parseHTML(html);
  for (const node of document.querySelectorAll("head, style, script")) {
    node.remove();
  }
  return turndown
    .turndown(document.body)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const stripPreHeadNodes = (html: string): string => {
  const htmlOpen = html.match(/<html\b[^>]*>/i);
  if (htmlOpen?.index == null) return html;
  const htmlOpenEnd = htmlOpen.index + htmlOpen[0].length;
  const headIdx = html.slice(htmlOpenEnd).search(/<head[\s>]/i);
  if (headIdx < 0) return html;
  const absoluteHeadIdx = htmlOpenEnd + headIdx;
  if (!html.slice(htmlOpenEnd, absoluteHeadIdx).trim()) return html;
  return html.slice(0, htmlOpenEnd) + html.slice(absoluteHeadIdx);
};

/** 修复 Telegram MarkdownV2 易出错片段（例如单独一行的 "***"） */
const sanitizeTelegramMdV2 = (md: string): string => {
  return md.replace(/(^|\n)\*{3,}(?=\n|$)/g, "$1\\*\\*\\*");
};

/** 标准 Markdown → Telegram MarkdownV2 */
export const toTelegramMdV2 = (markdown: string): string => {
  if (!markdown) return "";
  return markdownToMdV2(markdown).trimEnd();
};

const convertTelegramMdV2Safe = (markdown: string): string => {
  return sanitizeTelegramMdV2(toTelegramMdV2(markdown));
};

/**
 * 处理邮件正文：优先将 HTML 转 Markdown，fallback 到纯文本，超长截断并提示。
 * @param maxLen 本次可用的最大字符数（由调用方根据其他部分占用动态计算）
 */
export const formatBody = (
  text: string | undefined,
  html: string | undefined,
  maxLen: number,
): string => {
  let raw = "";

  if (html) {
    try {
      raw = htmlToMarkdown(html);
    } catch {
      // Turndown can throw on malformed URIs in links; fall through to plain text
      raw = "";
    }
  }

  if (!raw && text) {
    raw = text.trim();
  }

  if (!raw) return escapeMdV2("（正文为空）");

  // 残留 HTML 标签
  raw = stripHtmlTags(raw);

  const truncated = raw.length > maxLen;
  const truncatedHint = `\n\n${toTelegramMdV2("*… 正文过长，已截断 …*")}`;
  const converted = convertTelegramMdV2Safe(raw);

  if (!truncated) {
    const validEnd = findLongestValidMdV2Prefix(converted);
    return validEnd === converted.length ? converted : escapeMdV2(raw);
  }

  const bounded = converted.slice(0, maxLen);
  const validEnd = findLongestValidMdV2Prefix(bounded);
  if (validEnd > 0) return `${bounded.slice(0, validEnd)}${truncatedHint}`;

  // 极端兜底：如果回退仍不安全，降级为纯文本。
  return `${escapeMdV2(raw.substring(0, maxLen))}${truncatedHint}`;
};

// ─── 邮件正文包装 / 地址格式化 ──────────────────────────────────────────────

/** 将 PostalMime Address 格式化为可读字符串 */
export const formatAddress = (addr: Address): string => {
  if (addr.address)
    return addr.name ? `${addr.name} <${addr.address}>` : addr.address;
  return addr.name;
};

/**
 * 邮件 Date 头的安全解析。Gmail 来的是 RFC 5322（"Wed, 29 Apr 2026 …"），IMAP /
 * Outlook 走 PostalMime 来的是 ISO 8601 —— `new Date(...)` 两种都接，但格式有时
 * 残缺，统一收成 Date | null。空 / 解析不出来 → null。
 */
export const parseEmailDate = (
  input: string | null | undefined,
): Date | null => {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** 将纯文本包裹成可读的 HTML 页面 */
export const wrapPlainText = (text: string): string => {
  const escaped = escapeHtmlText(text);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:monospace;white-space:pre-wrap;word-break:break-word;max-width:800px;margin:2em auto;padding:0 1em;line-height:1.5;color:#333}</style></head><body>${escaped}</body></html>`;
};
const utf8Decoder = new TextDecoder("utf-8", {
  fatal: false,
  ignoreBOM: false,
});

/** HTML → Markdown 转换器实例（linkedom DOM + turndown） */
const turndown = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
  strongDelimiter: "**",
});

// Strip images — Telegram can't render inline images
turndown.addRule("stripImages", {
  filter: "img",
  replacement() {
    return "";
  },
});
