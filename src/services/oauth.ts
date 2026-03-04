import {
	KV_GMAIL_REFRESH_TOKEN,
	KV_OAUTH_STATE_PREFIX,
	ROUTE_GMAIL_WATCH,
	ROUTE_OAUTH_GOOGLE_CALLBACK,
	ROUTE_OAUTH_GOOGLE_START,
} from '../constants';
import type { Env } from '../types';

const GOOGLE_OAUTH_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

type GoogleTokenResponse = {
	access_token?: string;
	expires_in?: number;
	refresh_token?: string;
	scope?: string;
	token_type?: string;
	error?: string;
	error_description?: string;
};

export async function renderGoogleOAuthPage(request: Request, env: Env): Promise<Response> {
	const requestUrl = new URL(request.url);
	const origin = requestUrl.origin;
	const startUrl = new URL(ROUTE_OAUTH_GOOGLE_START, origin);
	startUrl.searchParams.set('secret', env.GMAIL_WATCH_SECRET);
	const callbackUrl = new URL(ROUTE_OAUTH_GOOGLE_CALLBACK, origin).toString();
	const watchUrl = new URL(ROUTE_GMAIL_WATCH, origin);
	watchUrl.searchParams.set('secret', env.GMAIL_WATCH_SECRET);

	const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gmail OAuth Token Helper</title>
  <style>
    :root {
      --bg: #f6f8fb;
      --card: #ffffff;
      --text: #18222d;
      --muted: #5f6b76;
      --line: #d9e2ec;
      --accent: #0f6ed8;
      --accent-hover: #0b57a8;
      --mono-bg: #f0f4f8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: var(--text);
      background: radial-gradient(circle at 15% -5%, #dfefff 0%, var(--bg) 50%);
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(760px, 100%);
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 12px 40px rgba(24, 34, 45, 0.08);
    }
    h1 {
      margin: 0 0 12px;
      font-size: 28px;
      line-height: 1.2;
    }
    p, li {
      font-size: 15px;
      line-height: 1.6;
      color: var(--muted);
    }
    ol {
      margin: 12px 0 0 20px;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    code {
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      background: var(--mono-bg);
      padding: 2px 6px;
      border-radius: 6px;
      color: #0f355e;
      word-break: break-all;
    }
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
    .note {
      margin-top: 14px;
      font-size: 14px;
      color: var(--muted);
    }
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
  </main>
</body>
</html>`;

	return new Response(html, {
		headers: {
			'content-type': 'text/html; charset=UTF-8',
			'cache-control': 'no-store',
		},
	});
}

export async function startGoogleOAuth(request: Request, env: Env): Promise<Response> {
	const requestUrl = new URL(request.url);
	const state = crypto.randomUUID();
	await env.EMAIL_KV.put(`${KV_OAUTH_STATE_PREFIX}${state}`, '1', {
		expirationTtl: OAUTH_STATE_TTL_SECONDS,
	});

	const redirectUri = new URL(ROUTE_OAUTH_GOOGLE_CALLBACK, requestUrl.origin).toString();
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
		return renderErrorPage(
			'Google OAuth 授权失败',
			requestUrl.searchParams.get('error_description') || oauthError,
			400,
		);
	}

	if (!code || !state) {
		return renderErrorPage('参数缺失', '回调中没有 code 或 state。', 400);
	}

	const stateKey = `${KV_OAUTH_STATE_PREFIX}${state}`;
	const stateExists = await env.EMAIL_KV.get(stateKey);
	if (!stateExists) {
		return renderErrorPage('state 无效', '授权会话已过期或不匹配，请重新发起授权。', 400);
	}
	await env.EMAIL_KV.delete(stateKey);

	const redirectUri = new URL(ROUTE_OAUTH_GOOGLE_CALLBACK, requestUrl.origin).toString();
	const tokenResp = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: env.GMAIL_CLIENT_ID,
			client_secret: env.GMAIL_CLIENT_SECRET,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code',
		}),
	});

	const rawBody = await tokenResp.text();
	let tokenData: GoogleTokenResponse = {};
	try {
		tokenData = JSON.parse(rawBody) as GoogleTokenResponse;
	} catch {
		tokenData = {};
	}

	if (!tokenResp.ok) {
		return renderErrorPage(
			'Token 交换失败',
			rawBody || `${tokenResp.status} ${tokenResp.statusText}`,
			tokenResp.status,
		);
	}

	const refreshToken = tokenData.refresh_token;
	const expiresIn = tokenData.expires_in;
	const scope = tokenData.scope || GMAIL_READONLY_SCOPE;
	const watchUrl = new URL(ROUTE_GMAIL_WATCH, requestUrl.origin);
	watchUrl.searchParams.set('secret', env.GMAIL_WATCH_SECRET);
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
    :root {
      --bg: #f6f8fb;
      --card: #ffffff;
      --text: #18222d;
      --muted: #5f6b76;
      --line: #d9e2ec;
      --ok: #166534;
      --warn: #b45309;
      --mono-bg: #f0f4f8;
      --btn: #0f6ed8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: var(--text);
      background: radial-gradient(circle at 10% -10%, #e6f8ef 0%, var(--bg) 55%);
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(780px, 100%);
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 12px 40px rgba(24, 34, 45, 0.08);
    }
    h1 { margin: 0 0 8px; font-size: 28px; color: ${refreshToken ? 'var(--ok)' : 'var(--warn)'}; }
    p, li { color: var(--muted); line-height: 1.6; font-size: 15px; }
    textarea {
      width: 100%;
      min-height: 108px;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 13px;
      background: var(--mono-bg);
      color: #0f355e;
      resize: vertical;
    }
    button {
      margin-top: 12px;
      background: var(--btn);
      color: white;
      border: 0;
      padding: 10px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
    }
    pre {
      background: var(--mono-bg);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      overflow: auto;
      font-size: 13px;
      font-family: "IBM Plex Mono", ui-monospace, monospace;
    }
    code {
      background: var(--mono-bg);
      padding: 2px 6px;
      border-radius: 6px;
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      color: #0f355e;
      word-break: break-all;
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
    <p>refresh_token 已保存到 KV 键 <code>${escapeHtml(KV_GMAIL_REFRESH_TOKEN)}</code>。</p>
    <p>返回 scope: <code>${escapeHtml(scope)}</code>${typeof expiresIn === 'number' ? `，access_token 有效期约 ${expiresIn} 秒` : ''}。</p>
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

	return new Response(html, {
		headers: {
			'content-type': 'text/html; charset=UTF-8',
			'cache-control': 'no-store',
		},
	});
}

function renderErrorPage(title: string, detail: string, status = 400): Response {
	const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      background: #fff7ed;
      color: #7c2d12;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(760px, 100%);
      background: #ffffff;
      border: 1px solid #fed7aa;
      border-radius: 14px;
      padding: 20px;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: #fff;
      border: 1px solid #fed7aa;
      border-radius: 10px;
      padding: 12px;
      color: #7c2d12;
      font-family: ui-monospace, monospace;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>${escapeHtml(title)}</h1>
    <pre>${escapeHtml(detail)}</pre>
  </main>
</body>
</html>`;

	return new Response(html, {
		status,
		headers: {
			'content-type': 'text/html; charset=UTF-8',
			'cache-control': 'no-store',
		},
	});
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}
