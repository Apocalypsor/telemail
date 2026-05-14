import { MAX_BODY_CHARS, MAX_LINKS } from "@worker/constants";

/** 去除裸 URL 尾部的标点，但保留平衡的括号 */
const cleanTrailingPunctuation = (url: string): string => {
  let u = url.replace(/[.,;:!?>]+$/, "");
  while (u.endsWith(")")) {
    const opens = (u.match(/\(/g) || []).length;
    const closes = (u.match(/\)/g) || []).length;
    if (closes > opens) u = u.slice(0, -1);
    else break;
  }
  return u;
};

/** 从文本中提取链接（Markdown 格式 + 裸链接），返回 {label, url} 数组，最多 MAX_LINKS 个 */
export const extractLinks = (
  text: string,
): { label: string; url: string }[] => {
  const links: { label: string; url: string }[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g)) {
    if (links.length >= MAX_LINKS) break;
    const url = m[2];
    if (!seen.has(url)) {
      seen.add(url);
      links.push({ label: m[1] || url, url });
    }
  }

  for (const m of text.matchAll(/(?<!\()(https?:\/\/\S+)/g)) {
    if (links.length >= MAX_LINKS) break;
    const url = cleanTrailingPunctuation(m[1]);
    if (!seen.has(url)) {
      seen.add(url);
      links.push({ label: url, url });
    }
  }

  return links;
};

/** 去除文本中的所有超链接（Markdown 链接保留文字，裸链接直接删除） */
const stripLinks = (text: string): string => {
  let out = text.replace(/\[([^\]]*)\]\(https?:\/\/[^)]*\)/g, "$1");
  out = out.replace(/https?:\/\/\S+/g, "");
  return out;
};

/** 预处理邮件正文：去首尾空行 + 去链接 + 截断 */
export const prepareBody = (rawBody: string): string => {
  const stripped = stripLinks(rawBody)
    .replace(/^\s*\n+/, "")
    .replace(/\n+\s*$/, "");
  return stripped.length > MAX_BODY_CHARS
    ? `${stripped.slice(0, MAX_BODY_CHARS)}...`
    : stripped;
};
