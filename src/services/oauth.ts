import {
	GOOGLE_OAUTH_TOKEN_URL,
	KV_GMAIL_REFRESH_TOKEN,
	KV_OAUTH_STATE_PREFIX,
	ROUTE_GMAIL_WATCH,
	ROUTE_OAUTH_GOOGLE_CALLBACK,
	ROUTE_OAUTH_GOOGLE_START,
} from '../constants';
import { BASE_CSS, escapeHtml, htmlResponse } from '../lib/html';
import type { Env } from '../types';

const GOOGLE_OAUTH_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export type GoogleTokenResponse = {
	access_token?: string;
	expires_in?: number;
	refresh_token?: string;
	scope?: string;
	token_type?: string;
	error?: string;
	error_description?: string;
};

function getCallbackUrl(origin: string): string {
	return new URL(ROUTE_OAUTH_GOOGLE_CALLBACK, origin).toString();
}

function getWatchUrl(origin: string, secret: string): URL {
	const url = new URL(ROUTE_GMAIL_WATCH, origin);
	url.searchParams.set('secret', secret);
	return url;
}

function backLink(secret: string): string {
	return `<p style="margin-top:18px"><a href="/?secret=${encodeURIComponent(secret)}" style="color:var(--accent);text-decoration:none">&larr; 返回主页</a></p>`;
}

export async function renderGoogleOAuthPage(request: Request, env: Env): Promise<Response> {
	const origin = new URL(request.url).origin;
	const startUrl = new URL(ROUTE_OAUTH_GOOGLE_START, origin);
	startUrl.searchParams.set('secret', env.GMAIL_WATCH_SECRET);
	const callbackUrl = getCallbackUrl(origin);
	const watchUrl = getWatchUrl(origin, env.GMAIL_WATCH_SECRET);

	const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gmail OAuth Token Helper</title>
  <style>
    ${BASE_CSS}
    ol { margin: 12px 0 0 20px; padding: 0; display: grid; gap: 8px; }
    .action {
      margin-top: 18px;
      display: inline-block;
      background: var(--accent);
      color: #fff;
      text-decoration: none;
      padding: 12px 16px;
      border-radius: 10px;
      font-weight: 600;
      transition: background-color .2s ease;
    }
    .action:hover { background: var(--accent-hover); }
    .note { margin-top: 14px; font-size: 14px; color: var(--muted); }
  </style>
</head>
<body>
  <main class="card">
    <h1>生成 Gmail Refresh Token</h1>
    <p>这个页面会使用你当前 Worker 的 <code>GMAIL_CLIENT_ID</code> 和 <code>GMAIL_CLIENT_SECRET</code> 发起 OAuth，然后把新的 <code>refresh_token</code> 自动保存到 <code>EMAIL_KV</code>。</p>
    <ol>
      <li>在 Google Cloud OAuth Client 的 <strong>Authorized redirect URIs</strong> 添加：<code>${escapeHtml(callbackUrl)}</code></li>
      <li>点击下方按钮，完成 Google 授权（会请求 <code>gmail.readonly</code>）。</li>
      <li>回调成功后会自动写入 KV 键：<code>${escapeHtml(KV_GMAIL_REFRESH_TOKEN)}</code>。</li>
      <li>更新后调用 <code>${escapeHtml(watchUrl.toString())}</code> 续订 watch。</li>
    </ol>
    <a class="action" href="${escapeHtml(startUrl.toString())}">开始授权并生成 Refresh Token</a>
    <p class="note">入口受 <code>?secret=...</code> 保护，使用和 <code>/gmail/watch</code> 同一个密钥。</p>
    ${backLink(env.GMAIL_WATCH_SECRET)}
  </main>
</body>
</html>`;

	return htmlResponse(html);
}

export async function startGoogleOAuth(request: Request, env: Env): Promise<Response> {
	const requestUrl = new URL(request.url);
	const state = crypto.randomUUID();
	await env.EMAIL_KV.put(`${KV_OAUTH_STATE_PREFIX}${state}`, '1', {
		expirationTtl: OAUTH_STATE_TTL_SECONDS,
	});

	const redirectUri = getCallbackUrl(requestUrl.origin);
	const authUrl = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);
	authUrl.searchParams.set('client_id', env.GMAIL_CLIENT_ID);
	authUrl.searchParams.set('redirect_uri', redirectUri);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('scope', GMAIL_READONLY_SCOPE);
	authUrl.searchParams.set('access_type', 'offline');
	authUrl.searchParams.set('prompt', 'consent');
	authUrl.searchParams.set('include_granted_scopes', 'true');
	authUrl.searchParams.set('state', state);

	return Response.redirect(authUrl.toString(), 302);
}

export async function handleGoogleOAuthCallback(request: Request, env: Env): Promise<Response> {
	const requestUrl = new URL(request.url);
	const code = requestUrl.searchParams.get('code');
	const state = requestUrl.searchParams.get('state');
	const oauthError = requestUrl.searchParams.get('error');

	if (oauthError) {
		return renderErrorPage('Google OAuth 授权失败', requestUrl.searchParams.get('error_description') || oauthError, env.GMAIL_WATCH_SECRET, 400);
	}

	if (!code || !state) {
		return renderErrorPage('参数缺失', '回调中没有 code 或 state。', env.GMAIL_WATCH_SECRET, 400);
	}

	const stateKey = `${KV_OAUTH_STATE_PREFIX}${state}`;
	const stateExists = await env.EMAIL_KV.get(stateKey);
	if (!stateExists) {
		return renderErrorPage('state 无效', '授权会话已过期或不匹配，请重新发起授权。', env.GMAIL_WATCH_SECRET, 400);
	}

	const redirectUri = getCallbackUrl(requestUrl.origin);
	const [, tokenResp] = await Promise.all([
		env.EMAIL_KV.delete(stateKey),
		fetch(GOOGLE_OAUTH_TOKEN_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				code,
				client_id: env.GMAIL_CLIENT_ID,
				client_secret: env.GMAIL_CLIENT_SECRET,
				redirect_uri: redirectUri,
				grant_type: 'authorization_code',
			}),
		}),
	]);

	const rawBody = await tokenResp.text();
	let tokenData: GoogleTokenResponse = {};
	try {
		tokenData = JSON.parse(rawBody) as GoogleTokenResponse;
	} catch {
		/* non-JSON response, tokenData stays empty */
	}

	if (!tokenResp.ok) {
		return renderErrorPage('Token 交换失败', rawBody || `${tokenResp.status} ${tokenResp.statusText}`, env.GMAIL_WATCH_SECRET, tokenResp.status);
	}

	const refreshToken = tokenData.refresh_token;
	const expiresIn = tokenData.expires_in;
	const scope = tokenData.scope || GMAIL_READONLY_SCOPE;
	const watchUrl = getWatchUrl(requestUrl.origin, env.GMAIL_WATCH_SECRET);
	if (refreshToken) {
		await env.EMAIL_KV.put(KV_GMAIL_REFRESH_TOKEN, refreshToken);
	}

	const title = refreshToken ? 'Refresh Token 已保存到 KV' : '本次未返回 Refresh Token';
	const statusText = refreshToken
		? `已写入 EMAIL_KV 的键 ${KV_GMAIL_REFRESH_TOKEN}，后续会自动使用。`
		: 'Google 返回成功，但没有 refresh_token。通常是同一账号已授权过且未强制重新授权。';
	const tokenBlock = refreshToken
		? `<textarea id="token" readonly>${escapeHtml(refreshToken)}</textarea>
<button id="copy">复制 Token</button>`
		: '<p class="warn">请重新执行授权流程，并确认登录的是目标 Google 账号。</p>';

	const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    ${BASE_CSS}
    h1 { color: ${refreshToken ? 'var(--ok)' : 'var(--warn)'}; }
    textarea {
      width: 100%;
      min-height: 108px;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 13px;
      background: var(--mono-bg);
      color: var(--mono-text);
      resize: vertical;
    }
    button {
      margin-top: 12px;
      background: var(--accent);
      color: white;
      border: 0;
      padding: 10px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
    }
    .warn { color: var(--warn); }
  </style>
</head>
<body>
  <main class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(statusText)}</p>
    ${tokenBlock}
    <h2>下一步</h2>
    <ol>
      <li>续订 Gmail watch：</li>
    </ol>
    <pre>curl -X POST "${escapeHtml(watchUrl.toString())}"</pre>
    ${refreshToken ? `<p>refresh_token 已保存到 KV 键 <code>${escapeHtml(KV_GMAIL_REFRESH_TOKEN)}</code>。</p>` : ''}
    <p>返回 scope: <code>${escapeHtml(scope)}</code>${typeof expiresIn === 'number' ? `，access_token 有效期约 ${expiresIn} 秒` : ''}。</p>
    ${backLink(env.GMAIL_WATCH_SECRET)}
  </main>
  <script>
    const btn = document.getElementById('copy');
    const input = document.getElementById('token');
    if (btn && input) {
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(input.value);
          btn.textContent = '已复制';
          setTimeout(() => { btn.textContent = '复制 Token'; }, 1200);
        } catch {
          btn.textContent = '复制失败';
        }
      });
    }
  </script>
</body>
</html>`;

	return htmlResponse(html);
}

function renderErrorPage(title: string, detail: string, secret: string, status = 400): Response {
	const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    ${BASE_CSS}
    h1 { color: var(--danger); }
    pre { white-space: pre-wrap; word-break: break-word; color: var(--danger); }
  </style>
</head>
<body>
  <main class="card">
    <h1>${escapeHtml(title)}</h1>
    <pre>${escapeHtml(detail)}</pre>
    ${backLink(secret)}
  </main>
</body>
</html>`;

	return htmlResponse(html, status);
}
