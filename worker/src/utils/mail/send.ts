import { type Address, addressParser } from "postal-mime";

const HEADER_UNSAFE_RE = /[\r\n]+/g;
const EMAIL_ADDR_RE = /^[^\s@<>]+@[^\s@<>]+$/;
const RE_SUBJECT_RE = /^\s*re\s*:/i;

const utf8Base64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const foldBase64 = (value: string): string => {
  const lines: string[] = [];
  for (let i = 0; i < value.length; i += 76) {
    lines.push(value.slice(i, i + 76));
  }
  return lines.join("\r\n");
};

const sanitizeHeaderValue = (value: string): string =>
  value.replace(HEADER_UNSAFE_RE, " ").trim();

const encodeMimeHeader = (value: string): string => {
  const sanitized = sanitizeHeaderValue(value);
  if (/^[\x20-\x7e]*$/.test(sanitized)) return sanitized;
  return `=?UTF-8?B?${utf8Base64(sanitized)}?=`;
};

const normalizeMessageId = (
  value: string | null | undefined,
): string | null => {
  const sanitized = sanitizeHeaderValue(value ?? "");
  if (!sanitized) return null;
  return sanitized.startsWith("<") ? sanitized : `<${sanitized}>`;
};

const parseReferencesHeader = (value: string | null | undefined): string[] => {
  const sanitized = sanitizeHeaderValue(value ?? "");
  if (!sanitized) return [];
  return sanitized
    .split(/\s+/)
    .map(normalizeMessageId)
    .filter((item): item is string => !!item);
};

export const parseEmailAddressList = (value: string): string[] => {
  const normalized = value.replace(/[;\n]+/g, ",");
  const seen = new Set<string>();
  const addresses: string[] = [];

  for (const item of addressParser(normalized, { flatten: true })) {
    const address = item.address?.trim();
    if (!address || !EMAIL_ADDR_RE.test(address)) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    addresses.push(address);
  }

  return addresses;
};

export const postalAddressesToList = (
  addresses: Address[] | Address | null | undefined,
): string[] => {
  const list = Array.isArray(addresses)
    ? addresses
    : addresses
      ? [addresses]
      : [];
  return parseEmailAddressList(
    list
      .map((item) => item.address ?? "")
      .filter(Boolean)
      .join(","),
  );
};

export const replyRecipientsFromPostal = (
  replyTo: Address[] | null | undefined,
  from: Address | null | undefined,
): string[] => {
  const replyToAddresses = postalAddressesToList(replyTo);
  if (replyToAddresses.length > 0) return replyToAddresses;
  return postalAddressesToList(from);
};

export const replyRecipientsFromHeaders = (
  replyToHeader: string | null | undefined,
  fromHeader: string | null | undefined,
): string[] => {
  const replyTo = parseEmailAddressList(replyToHeader ?? "");
  if (replyTo.length > 0) return replyTo;
  return parseEmailAddressList(fromHeader ?? "");
};

export const buildReplySubject = (
  subject: string | null | undefined,
): string => {
  const base = subject?.trim() || "(no subject)";
  return RE_SUBJECT_RE.test(base) ? base : `Re: ${base}`;
};

export const buildReplyReferences = (
  referencesHeader: string | null | undefined,
  originalMessageId: string | null | undefined,
): string[] => {
  const references = parseReferencesHeader(referencesHeader);
  const original = normalizeMessageId(originalMessageId);
  if (original && !references.includes(original)) references.push(original);
  return references;
};

export const buildTextMimeMessage = ({
  from,
  to,
  subject,
  body,
  inReplyTo,
  references,
}: TextMimeMessageInput): string => {
  const headers: string[] = [];
  const sanitizedFrom = sanitizeHeaderValue(from ?? "");
  if (sanitizedFrom) headers.push(`From: ${sanitizedFrom}`);
  headers.push(`To: ${to.map(sanitizeHeaderValue).join(", ")}`);
  headers.push(`Subject: ${encodeMimeHeader(subject)}`);
  const normalizedInReplyTo = normalizeMessageId(inReplyTo);
  if (normalizedInReplyTo) headers.push(`In-Reply-To: ${normalizedInReplyTo}`);
  const normalizedReferences = references
    ?.map(normalizeMessageId)
    .filter((item): item is string => !!item);
  if (normalizedReferences?.length) {
    headers.push(`References: ${normalizedReferences.join(" ")}`);
  }
  headers.push(
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  );
  return `${headers.join("\r\n")}\r\n\r\n${foldBase64(utf8Base64(body))}`;
};

export const buildMultipartMimeMessage = ({
  from,
  to,
  subject,
  text,
  html,
  inReplyTo,
  references,
}: MultipartMimeMessageInput): string => {
  const boundary = `telemail-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const headers: string[] = [];
  const sanitizedFrom = sanitizeHeaderValue(from ?? "");
  if (sanitizedFrom) headers.push(`From: ${sanitizedFrom}`);
  headers.push(`To: ${to.map(sanitizeHeaderValue).join(", ")}`);
  headers.push(`Subject: ${encodeMimeHeader(subject)}`);
  const normalizedInReplyTo = normalizeMessageId(inReplyTo);
  if (normalizedInReplyTo) headers.push(`In-Reply-To: ${normalizedInReplyTo}`);
  const normalizedReferences = references
    ?.map(normalizeMessageId)
    .filter((item): item is string => !!item);
  if (normalizedReferences?.length) {
    headers.push(`References: ${normalizedReferences.join(" ")}`);
  }
  headers.push(
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  );

  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    foldBase64(utf8Base64(text)),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    foldBase64(utf8Base64(html)),
    `--${boundary}--`,
    "",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
};

export const mimeToBase64Url = (mime: string): string => {
  return utf8Base64(mime)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

export interface TextMimeMessageInput {
  from?: string | null;
  to: string[];
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string[] | null;
}

export interface MultipartMimeMessageInput
  extends Omit<TextMimeMessageInput, "body"> {
  text: string;
  html: string;
}
