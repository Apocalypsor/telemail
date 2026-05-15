/** 使用 OpenAI compatible API 对邮件正文进行 AI 分析（摘要 + 标签） */

import { http } from "@worker/clients/http";
import { LLM_TIMEOUT_MS, MAX_LINKS } from "@worker/constants";
import { extractLinks, prepareBody } from "@worker/utils/mail/llm-input";

/** 从逗号分隔的 API Key 列表中随机选一个 */
const pickRandomKey = (apiKeys: string): string => {
  const keys = apiKeys
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  return keys[Math.floor(Math.random() * keys.length)];
};

/** 调用 OpenAI compatible /v1/chat/completions 接口，支持 JSON mode */
const callLLM = async (
  baseUrl: string,
  apiKeys: string,
  model: string,
  prompt: string,
  json?: boolean,
): Promise<string> => {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const data = await http
    .post(url, {
      headers: { Authorization: `Bearer ${pickRandomKey(apiKeys)}` },
      json: {
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        ...(json && { response_format: { type: "json_object" } }),
      },
      timeout: LLM_TIMEOUT_MS,
    })
    .json<{ choices?: Array<{ message: { content: string } }> }>();

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM API returned no choices");
  return content;
};

/** 一次 LLM 调用完成邮件分析：摘要 + 标签 */
export const analyzeEmail = async (
  baseUrl: string,
  apiKey: string,
  model: string,
  subject: string,
  rawBody: string,
): Promise<EmailAnalysis> => {
  const body = prepareBody(rawBody);
  const links = extractLinks(rawBody);

  const safeLinks = links.slice(0, MAX_LINKS);
  const linksSection =
    safeLinks.length > 0
      ? `\n\nLinks found in this email:\n${safeLinks.map((l, i) => `${i + 1}. [${l.label.replace(/[[\]]/g, "")}](${l.url})`).join("\n")}\n`
      : "";

  const linkRule =
    safeLinks.length > 0
      ? `- If the email contains important actionable links (login, verification, activation, confirmation, password reset, etc.), include them in the summary using Markdown link syntax [text](url). Skip tracking/pixel/unsubscribe links\n`
      : "";

  const prompt =
    `Analyze the following email and return a JSON object with these fields:\n\n` +
    `1. "summary": A bullet-point summary of the email (3-6 bullets).\n` +
    `   Language rules:\n` +
    `   - If the email is in English, write the summary in English\n` +
    `   - If the email is in any other language, write the summary in 简体中文\n` +
    `   Rules:\n` +
    `   - Always summarize the email, including verification-code, OTP, passcode, security-code, or login-code emails\n` +
    `   - Each bullet starts with "• "\n` +
    `   - Do not use "the user" as subject, no lead-ins like "the email says"\n` +
    `   - State directly what happened, what the key data is, and what action is needed\n` +
    linkRule +
    `   - You may use Markdown formatting: **bold**, _italic_, \`code\`\n\n` +
    `2. "short_summary": A SINGLE compact line (target max ~60 characters, no line breaks, no markdown, no bullet) suitable for a list preview.\n` +
    `   - Same language rule as "summary" (English if email is English, else 简体中文)\n` +
    `   - Capture concrete key facts, not a generic category. Prefer: sender/service + item/event/name + time/date + identifier/status.\n` +
    `   - For shopping/order/receipt/shipping/refund emails, include merchant + purchased item or service + order number (if present) + status/time/amount. Examples: "Amazon AirPods 订单#112 已发货", "Apple MacBook 5月10日付款成功", "Uber 行程¥128 已支付"\n` +
    `   - For flight/train/travel tickets, include carrier + flight/train number + route + departure/arrival time/date + booking/order number or status when present. Examples: "UA857 SFO→PVG 5月12日20:30 已确认", "国航CA982 6月1日 北京→纽约 已出票"\n` +
    `   - For hotel/lodging bookings, include hotel name + city/room if useful + check-in/check-out date + booking/order number or status when present. Examples: "东京希尔顿 5月12日入住 订单#ABC123", "Marriott NYC 6/1-6/3 booking confirmed"\n` +
    `   - If details exceed the length target, keep the most actionable identifiers first: item/hotel/flight name, time/date, order/booking/tracking number, status.\n` +
    `   - Always produce a non-empty value\n\n` +
    `3. "tags": An array of 1-3 PascalCase tags for this email.\n` +
    `   Rules:\n` +
    `   - If the email is in English, write tags in English; otherwise write tags in 简体中文\n` +
    `   - Each tag must be PascalCase (first letter of each word capitalized, no spaces or underscores), no "#" prefix (e.g. "PasswordReset", "Github", "OrderConfirmation")\n` +
    `   - Capture: sender/service name, category (notification, newsletter, promotion, verification), key topic\n\n` +
    `4. "junk": An object with junk/spam classification.\n` +
    `   - "is_junk": true if this is spam, phishing, unsolicited marketing, scam, or bulk promotional email with no personal relevance; false otherwise.\n` +
    `   - "confidence": A float 0.0–1.0 indicating how confident you are in the junk classification.\n` +
    `   - Transactional emails (receipts, order confirmations, notifications from services the user signed up for), newsletters from subscribed services, and any email with verification codes are NOT junk.\n\n` +
    `Output ONLY valid JSON, no other text. Example:\n` +
    `{"summary": "• ...", "short_summary": "GitHub login verification code", "tags": ["Github", "Verification", "Security"], "junk": {"is_junk": false, "confidence": 0.05}}\n\n` +
    `Subject: ${subject}\n\n` +
    `Body:\n${body}` +
    linksSection;

  const raw = await callLLM(baseUrl, apiKey, model, prompt, true);

  // 解析 JSON，容忍 markdown code fence 包裹
  const jsonStr = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(jsonStr) as {
      summary?: string;
      short_summary?: string;
      tags?: string[];
      junk?: { is_junk?: boolean; confidence?: number };
    };
    const isJunk = parsed.junk?.is_junk === true;
    const junkConfidence = Math.min(
      1,
      Math.max(0, parsed.junk?.confidence ?? 0),
    );
    return {
      summary: parsed.summary ?? "",
      shortSummary: (parsed.short_summary ?? "").trim().replace(/\s+/g, " "),
      tags: (parsed.tags ?? []).slice(0, 5),
      isJunk,
      junkConfidence,
    };
  } catch {
    // JSON 解析失败，抛出错误，不编辑消息，保存到 failed_emails 等待重试
    throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 200)}`);
  }
};

export const optimizeEmailDraft = async (
  baseUrl: string,
  apiKey: string,
  model: string,
  subject: string,
  body: string,
  replyMode: boolean,
  senderEmail?: string | null,
  originalEmail?: OriginalEmailContext,
): Promise<OptimizedEmailDraft> => {
  const originalSection = originalEmail
    ? `\n\nOriginal email context for this reply:\n` +
      `From: ${originalEmail.from || "(unknown)"}\n` +
      `To: ${originalEmail.to || "(unknown)"}\n` +
      `Subject: ${originalEmail.subject || "(none)"}\n\n` +
      `Original body:\n${originalEmail.body || "(empty)"}\n`
    : "";
  const senderSection = senderEmail ? `\nSending as: ${senderEmail}\n` : "";
  const needsSubject = !subject.trim();

  const prompt =
    `You are helping write a complete email draft in Markdown.\n` +
    `Turn the user's input into a finished email that can be sent directly.\n` +
    `Return ONLY valid JSON with these fields:\n` +
    `- "body": the rewritten draft body in Markdown.\n` +
    `- "subject": ${needsSubject ? "a concise generated subject line" : "null. Do not generate or rewrite a subject because one already exists"}.\n\n` +
    `Rules:\n` +
    `- Keep the same language as the draft unless the draft is mixed; then prefer the dominant language.\n` +
    `- Make the email concise, but include every necessary detail, request, answer, date, name, and action item.\n` +
    `- Keep the tone friendly and professional.\n` +
    `- Prefer short paragraphs over long blocks.\n` +
    `- Keep Markdown syntax valid and useful.\n` +
    `- Preserve paragraph breaks and deliberate blank lines, especially before a signature or closing line.\n` +
    `- Follow normal email structure: greeting, body paragraphs, and a short closing line.\n` +
    `- If the draft is short, vague, or just a hint, expand it into a complete email instead of keeping it brief.\n` +
    `- Never return a bare fragment like "hi" or a one-line note when the context requires a full email.\n` +
    `- If the draft is a reply, answer the original email directly and naturally, in the order the recipient would expect.\n` +
    `- If the draft is a new email, open with a concise greeting and close with a polite sign-off.\n` +
    `- If the draft already has a greeting or sign-off, improve it rather than removing it.\n` +
    `- Use bullets only when they make the email clearer, especially for multiple requests or action items.\n` +
    `- Do not add explanations, labels, headings, or a preface.\n` +
    `- Do not invent new facts.\n` +
    `- If this is a reply, use the original email context to make the reply relevant, but do not quote or summarize the original email unless the draft asks for it.\n` +
    `- If this is a reply, keep the tone concise, direct, and polite.\n` +
    `- If the original email context makes a greeting or closing natural, use it sparingly and keep it human.\n` +
    `- If the draft is only a short prompt, infer the implied message and complete the email naturally.\n` +
    `- If the user only typed something like "hi", "thanks", or a one-line note, infer the rest of the email from the context and make it complete.\n` +
    `- If sender or recipient names are available, use them naturally; otherwise use a neutral greeting.\n` +
    `- Email addresses are context only. Never use an email address directly as a greeting name, recipient name, sender name, signature name, or closing.\n` +
    `- If a From/To value has a display name, you may use that display name. If it only has an email address, use a neutral greeting instead.\n` +
    `- Do not sign off with the sender email address. If no sender name is available, use a short neutral sign-off without a name.\n` +
    `- If the original sender looks like a person, use a personal greeting; if it looks like a service or support mailbox, use a neutral professional greeting.\n` +
    `- If the body is already strong, you may make only light edits.\n` +
    `- If an existing subject was provided, return subject as null and do not generate, rewrite, translate, or improve it.\n` +
    `- If "subject" is needed, keep it friendly, professional, specific, and under 80 characters when possible.\n` +
    `- If this is a reply and the original subject is meaningful, keep a natural reply subject with the Re: prefix.\n` +
    `- If this is a reply but the original subject is empty or generic, create a specific reply subject from the draft and context.\n` +
    `- Do not put quotes, markdown, labels, or explanations in "subject".\n` +
    `- Do not invent new facts in either field.\n` +
    `- Output JSON only. Do not wrap it in a code fence.\n\n` +
    `Context:\n` +
    `Reply mode: ${replyMode ? "yes" : "no"}\n` +
    `Subject: ${subject || "(none)"}\n` +
    senderSection +
    originalSection +
    `\n\n` +
    `Draft:\n${body}`;

  const raw = await callLLM(baseUrl, apiKey, model, prompt, true);
  const parsed = parseOptimizedEmailDraft(raw);
  return {
    body: parsed.body,
    subject: needsSubject ? parsed.subject : undefined,
  };
};

const parseOptimizedEmailDraft = (raw: string): OptimizedEmailDraft => {
  const jsonStr = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(jsonStr) as {
      body?: unknown;
      subject?: unknown;
    };
    const body =
      typeof parsed.body === "string"
        ? cleanGeneratedMarkdown(parsed.body)
        : "";
    const subject =
      typeof parsed.subject === "string"
        ? cleanGeneratedSubject(parsed.subject)
        : undefined;
    if (!body.trim()) throw new Error("LLM returned empty body");
    return { body, subject };
  } catch (err) {
    throw new Error(
      `LLM returned invalid optimized draft JSON: ${raw.slice(0, 200)}`,
      { cause: err },
    );
  }
};

const cleanGeneratedMarkdown = (value: string): string => {
  return value
    .replace(/^\s*```(?:markdown|md)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "");
};

const cleanGeneratedSubject = (value: string): string => {
  return value
    .replace(/^\s*```(?:text|markdown|md)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .replace(/^subject\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
};

export interface OriginalEmailContext {
  subject: string | null;
  from: string | null;
  to: string | null;
  body: string;
}

export interface OptimizedEmailDraft {
  body: string;
  subject?: string;
}

/** LLM 一次调用返回结果 */
export interface EmailAnalysis {
  /** 摘要（bullet list） */
  summary: string;
  /** 一句话摘要（用于邮件列表显示） */
  shortSummary: string;
  /** 标签 */
  tags: string[];
  /** 是否为垃圾邮件 */
  isJunk: boolean;
  /** 垃圾邮件置信度 0-1 */
  junkConfidence: number;
}
