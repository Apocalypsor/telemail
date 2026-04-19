// ── API routes (POST / webhooks) ─────────────────────────────────────────────
// Provider-specific push / bridge routes 定义在各自的 provider 文件里（见
// `providers/gmail/index.ts` 等）—— 外部（如 Pub/Sub、MS Graph、IMAP bridge）用的是硬编码 URL。
export const ROUTE_TELEGRAM_WEBHOOK = "/api/telegram/webhook";
export const ROUTE_PREVIEW_API = "/api/preview";
export const ROUTE_CORS_PROXY = "/api/cors-proxy";

// ── Auth routes ──────────────────────────────────────────────────────────────
export const ROUTE_LOGIN = "/login";
export const ROUTE_LOGIN_CALLBACK = "/login/callback";

// ── Path param names ─────────────────────────────────────────────────────────
export const PARAM_PROVIDER = "provider";

// ── Page routes (GET / HTML) ─────────────────────────────────────────────────
// OAuth 路由按 AccountType 聚合：/oauth/gmail/*, /oauth/outlook/*, ...
export const ROUTE_OAUTH_SETUP = `/oauth/:${PARAM_PROVIDER}`;
export const ROUTE_OAUTH_START = `/oauth/:${PARAM_PROVIDER}/start`;
export const ROUTE_OAUTH_CALLBACK = `/oauth/:${PARAM_PROVIDER}/callback`;

export const ROUTE_PREVIEW = "/preview";
export const ROUTE_MAIL = "/mail/:id";
export const ROUTE_JUNK_CHECK = "/junk-check";
export const ROUTE_JUNK_CHECK_API = "/api/junk-check";
export const ROUTE_MAIL_MOVE_TO_INBOX = "/api/mail/:id/move-to-inbox";
export const ROUTE_MAIL_MARK_JUNK = "/api/mail/:id/mark-as-junk";
export const ROUTE_MAIL_TRASH = "/api/mail/:id/trash";
export const ROUTE_MAIL_TOGGLE_STAR = "/api/mail/:id/toggle-star";
export const ROUTE_MAIL_ARCHIVE = "/api/mail/:id/archive";
export const ROUTE_MAIL_UNARCHIVE = "/api/mail/:id/unarchive";
