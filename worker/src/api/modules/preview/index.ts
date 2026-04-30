import { authSession } from "@api/plugins/auth-session";
import { cf } from "@api/plugins/cf";
import { http } from "@clients/http";
import { analyzeEmail } from "@clients/llm";
import { formatBody } from "@utils/format";
import { verifyProxySignature } from "@utils/mail-html";
import { Elysia } from "elysia";
import { HTTPError } from "ky";
import { MAX_BODY_CHARS } from "@/constants";
import {
  JunkCheckBody,
  PreviewBody,
  PreviewResponse,
  ProxyQuery,
} from "./model";

/**
 * 预览类工具：HTML 格式化预览 + 垃圾邮件检测 + CORS 代理。
 *  - /api/preview, /api/junk-check 走 session cookie 鉴权（web 工具页用）
 *  - /api/cors-proxy 走 ADMIN_SECRET 签名校验（邮件正文图片代理）
 */
export const previewController = new Elysia({ name: "controller.preview" })

  // HTML 格式化预览
  .use(authSession)
  .post(
    "/api/preview",
    ({ body }) => {
      const html = body.html;
      if (!html) return { result: "", length: 0 };
      const result = formatBody(undefined, html, MAX_BODY_CHARS);
      return { result, length: result.length };
    },
    { body: PreviewBody, response: PreviewResponse },
  )

  // 垃圾邮件检测
  .post(
    "/api/junk-check",
    async ({ env, body, status }) => {
      if (!env.LLM_API_URL || !env.LLM_API_KEY || !env.LLM_MODEL)
        return status(500, { error: "LLM not configured" });
      const result = await analyzeEmail(
        env.LLM_API_URL,
        env.LLM_API_KEY,
        env.LLM_MODEL,
        body.subject ?? "",
        body.body ?? "",
      );
      return {
        isJunk: result.isJunk,
        junkConfidence: result.junkConfidence,
        summary: result.summary,
        tags: result.tags,
      };
    },
    { body: JunkCheckBody },
  );

/**
 * CORS proxy —— 邮件正文里的远端图片走它绕过跨域。URL + sig 由
 * `verifyProxySignature` 用 ADMIN_SECRET 校验。**不走 session auth** —— 邮件
 * 预览页（Pages SPA）渲染图片时浏览器直接发 GET。
 */
export const corsProxyController = new Elysia({ name: "controller.cors-proxy" })
  .use(cf)
  .get(
    "/api/cors-proxy",
    async ({ env, query, status }) => {
      const { url, sig } = query;
      if (!verifyProxySignature(env.ADMIN_SECRET, url, sig))
        return status(403, "Invalid signature");

      try {
        const resp = await http.get(url);
        const contentType =
          resp.headers.get("content-type") ?? "application/octet-stream";
        return new Response(resp.body, {
          headers: {
            "content-type": contentType,
            "cache-control": "public, max-age=86400",
          },
        });
      } catch (err) {
        if (err instanceof HTTPError) {
          return status(err.response.status as 502, "Upstream error");
        }
        return status(502, "Failed to fetch image");
      }
    },
    { query: ProxyQuery },
  );
