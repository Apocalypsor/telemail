import { hmacSha256Hex, timingSafeEqual } from "@worker/utils/hash";

type AsyncStringReplacer = (match: RegExpMatchArray) => Promise<string>;

interface RewriterElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): unknown;
}

/** 验证 CORS 代理 URL 签名 */
export const verifyProxySignature = async (
  secret: string,
  url: string,
  signature: string,
): Promise<boolean> => {
  return timingSafeEqual(await signProxyUrl(secret, url), signature);
};

/** 用 HTMLRewriter 将 HTML 中所有外部资源 URL 改写为经由 CORS 代理 */
export const proxyImages = async (
  html: string,
  secret: string,
): Promise<string> => {
  return new HTMLRewriter()
    .on("img", {
      async element(el) {
        await proxyUrlAttribute(el, "src", secret);
        await proxySrcsetAttribute(el, secret);
      },
    })
    .on("source", {
      async element(el) {
        await proxySrcsetAttribute(el, secret);
      },
    })
    .on("[style]", {
      async element(el) {
        const style = el.getAttribute("style");
        if (style?.includes("url(")) {
          el.setAttribute("style", await proxyStyleUrls(style, secret));
        }
      },
    })
    .transform(new Response(html))
    .text();
};

/** 为 CORS 代理 URL 生成 HMAC-SHA256 签名 */
const signProxyUrl = (secret: string, url: string): Promise<string> => {
  return hmacSha256Hex(secret, url, 32);
};

/** 将外部 URL 改写为经由 CORS 代理（附带 HMAC 签名） */
const proxied = async (url: string, secret: string): Promise<string> => {
  if (!/^https?:\/\//i.test(url)) return url;
  const sig = await signProxyUrl(secret, url);
  return `/api/cors-proxy?url=${encodeURIComponent(url)}&sig=${sig}`;
};

const proxyUrlAttribute = async (
  el: RewriterElement,
  attribute: string,
  secret: string,
): Promise<void> => {
  const value = el.getAttribute(attribute);
  if (value) el.setAttribute(attribute, await proxied(value, secret));
};

const proxySrcsetAttribute = async (
  el: RewriterElement,
  secret: string,
): Promise<void> => {
  const srcset = el.getAttribute("srcset");
  if (srcset) el.setAttribute("srcset", await proxySrcset(srcset, secret));
};

const proxySrcset = async (srcset: string, secret: string): Promise<string> => {
  return replaceAsync(
    srcset,
    /(\S+)(\s+[\d.]+[wx])/g,
    async (match) => `${await proxied(match[1], secret)}${match[2]}`,
  );
};

const proxyStyleUrls = async (
  style: string,
  secret: string,
): Promise<string> => {
  return replaceAsync(
    style,
    /url\(\s*(['"]?)(https?:\/\/[^)'"]+)\1\s*\)/gi,
    async (match) =>
      `url(${match[1]}${await proxied(match[2], secret)}${match[1]})`,
  );
};

const replaceAsync = async (
  input: string,
  regex: RegExp,
  replacer: AsyncStringReplacer,
): Promise<string> => {
  const matches = Array.from(input.matchAll(regex));
  const replacements = await Promise.all(matches.map(replacer));
  let output = "";
  let lastIndex = 0;
  for (const [i, match] of matches.entries()) {
    output += input.slice(lastIndex, match.index);
    output += replacements[i];
    lastIndex = match.index + match[0].length;
  }
  return `${output}${input.slice(lastIndex)}`;
};
