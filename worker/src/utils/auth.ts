import { SESSION_TTL, TG_AUTH_MAX_AGE } from "@worker/constants";
import { hmacSha256Hex, timingSafeEqual } from "@worker/utils/hash";

// ── Telegram Login Widget ───────────────────────────────────────────────────

export interface TelegramLoginData {
  id: string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
}

/** Telegram Mini App 用户信息（来自 initData 的 user 字段） */
interface TgWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

/** 验证 Telegram Login Widget 数据（https://core.telegram.org/widgets/login#checking-authorization） */
export const verifyTelegramLogin = async (
  botToken: string,
  data: TelegramLoginData,
): Promise<boolean> => {
  const authDate = parseInt(data.auth_date, 10);
  if (Number.isNaN(authDate) || Date.now() / 1000 - authDate > TG_AUTH_MAX_AGE)
    return false;

  // data_check_string: alphabetically sorted key=value pairs (excluding hash)
  const checkString = Object.entries(data)
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  // secret_key = SHA256(bot_token)
  const tokenHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(botToken),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    tokenHash,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(checkString),
  );
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(expected, data.hash);
};

// ── Session cookie ──────────────────────────────────────────────────────────

/** 生成 session cookie 值: telegramId:timestamp:hmac */
export const generateSessionCookie = async (
  secret: string,
  telegramId: string,
): Promise<{ value: string; maxAge: number }> => {
  const ts = Math.floor(Date.now() / 1000);
  const payload = `${telegramId}:${ts}`;
  const hmac = await hmacSha256Hex(secret, payload, 32);
  return { value: `${payload}:${hmac}`, maxAge: SESSION_TTL };
};

/** 验证 session cookie，返回 telegramId 或 null */
export const verifySessionCookie = async (
  secret: string,
  cookie: string,
): Promise<string | null> => {
  const parts = cookie.split(":");
  if (parts.length !== 3) return null;
  const [telegramId, tsStr, hmac] = parts;
  const ts = parseInt(tsStr, 10);
  if (Number.isNaN(ts) || Date.now() / 1000 - ts > SESSION_TTL) return null;

  const expected = await hmacSha256Hex(secret, `${telegramId}:${tsStr}`, 32);
  if (!timingSafeEqual(expected, hmac)) return null;
  return telegramId;
};

/**
 * 校验 Telegram Mini App initData。规范见
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * - secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
 * - hash       = HMAC_SHA256(key=secret_key, message=data_check_string)
 * data_check_string 由除 `hash` 外的所有 key=value 按字母序拼接，行分隔符 `\n`。
 *
 * 通过则返回 user，并带 maxAgeSeconds 限制 auth_date 防重放。
 */
export const verifyTgInitData = async (
  botToken: string,
  initData: string,
  maxAgeSeconds = 24 * 3600,
): Promise<TgWebAppUser | null> => {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const entries: [string, string][] = [];
  for (const [k, v] of params) entries.push([k, v]);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = await hmacSha256(
    new TextEncoder().encode("WebAppData"),
    botToken,
  );
  const computed = await hmacSha256(secretKey, dataCheckString);
  if (!timingSafeEqual(bytesToHex(computed), hash)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  const userStr = params.get("user");
  if (!userStr) return null;
  try {
    const user = JSON.parse(userStr) as TgWebAppUser;
    if (typeof user.id !== "number") return null;
    return user;
  } catch {
    return null;
  }
};

const hmacSha256 = async (
  keyBytes: Uint8Array | ArrayBuffer,
  data: string,
): Promise<Uint8Array> => {
  const buf =
    keyBytes instanceof ArrayBuffer
      ? keyBytes
      : (keyBytes.buffer.slice(
          keyBytes.byteOffset,
          keyBytes.byteOffset + keyBytes.byteLength,
        ) as ArrayBuffer);
  const key = await crypto.subtle.importKey(
    "raw",
    buf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return new Uint8Array(sig);
};

const bytesToHex = (b: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
};
