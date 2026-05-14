import { createHmac } from "node:crypto";
import { timingSafeEqual } from "@worker/utils/hash";

/** 为 CORS 代理 URL 生成 HMAC-SHA256 签名（同步） */
const signProxyUrl = (secret: string, url: string): string => {
  return createHmac("sha256", secret).update(url).digest("hex").slice(0, 32);
};

/** 验证 CORS 代理 URL 签名 */
export const verifyProxySignature = (
  secret: string,
  url: string,
  signature: string,
): boolean => {
  return timingSafeEqual(signProxyUrl(secret, url), signature);
};

/** 将外部 URL 改写为经由 CORS 代理（附带 HMAC 签名） */
const proxied = (url: string, secret: string): string => {
  if (!/^https?:\/\//i.test(url)) return url;
  const sig = signProxyUrl(secret, url);
  return `/api/cors-proxy?url=${encodeURIComponent(url)}&sig=${sig}`;
};

/** 用 HTMLRewriter 将 HTML 中所有外部资源 URL 改写为经由 CORS 代理 */
export const proxyImages = async (
  html: string,
  secret: string,
): Promise<string> => {
  return new HTMLRewriter()
    .on("img", {
      element(el) {
        const src = el.getAttribute("src");
        if (src) el.setAttribute("src", proxied(src, secret));
        const srcset = el.getAttribute("srcset");
        if (srcset) {
          el.setAttribute(
            "srcset",
            srcset.replace(
              /(\S+)(\s+[\d.]+[wx])/g,
              (_, url, desc) => `${proxied(url, secret)}${desc}`,
            ),
          );
        }
      },
    })
    .on("source", {
      element(el) {
        const srcset = el.getAttribute("srcset");
        if (srcset) {
          el.setAttribute(
            "srcset",
            srcset.replace(
              /(\S+)(\s+[\d.]+[wx])/g,
              (_, url, desc) => `${proxied(url, secret)}${desc}`,
            ),
          );
        }
      },
    })
    .on("[style]", {
      element(el) {
        const style = el.getAttribute("style");
        if (style?.includes("url(")) {
          el.setAttribute(
            "style",
            style.replace(
              /url\(\s*(['"]?)(https?:\/\/[^)'"]+)\1\s*\)/gi,
              (_, q, url) => `url(${q}${proxied(url, secret)}${q})`,
            ),
          );
        }
      },
    })
    .transform(new Response(html))
    .text();
};
