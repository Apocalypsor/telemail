import { ROUTE_GMAIL_WATCH, ROUTE_OAUTH_GOOGLE } from '../constants';
import { escapeHtml, htmlPage, htmlResponse } from '../lib/html';
import type { Env } from '../types';

export function renderHomePage(error?: string): Response {
	const errorHtml = error ? `<p class="error">${escapeHtml(error)}</p>` : '';
	const html = htmlPage(
		'Gmail → Telegram Bridge',
		`.card { width: min(420px, 100%); }
    label { display: block; font-size: 14px; color: var(--muted); margin-bottom: 6px; }
    input {
      width: 100%; padding: 10px 14px;
      border: 1px solid var(--line); border-radius: 10px;
      background: var(--mono-bg); color: var(--text);
      font-size: 15px; outline: none; transition: border .2s;
    }
    input:focus { border-color: var(--accent); }
    .btn { width: 100%; margin-top: 16px; }
    .error { color: var(--danger); font-size: 14px; margin-bottom: 14px; }`,
		`<main class="card">
    <h1>Gmail → Telegram Bridge</h1>
    <p>请输入密钥以继续</p>
    ${errorHtml}
    <form method="POST" action="/" style="margin-top:16px">
      <label for="secret">Secret</label>
      <input id="secret" name="secret" type="password" placeholder="GMAIL_WATCH_SECRET" required autofocus>
      <button class="btn btn-primary" type="submit">进入</button>
    </form>
  </main>`,
	);
	return htmlResponse(html, error ? 403 : 200);
}

export async function handleHomeLogin(request: Request, env: Env): Promise<Response> {
	const form = await request.formData();
	const secret = form.get('secret');
	if (typeof secret !== 'string' || secret !== env.GMAIL_WATCH_SECRET) {
		return renderHomePage('密钥错误，请重试');
	}
	return renderDashboard(secret);
}

export function renderDashboard(secret: string): Response {
	const oauthUrl = `${ROUTE_OAUTH_GOOGLE}?secret=${encodeURIComponent(secret)}`;
	const watchUrl = `${ROUTE_GMAIL_WATCH}?secret=${encodeURIComponent(secret)}`;
	const html = htmlPage(
		'Dashboard — Gmail → Telegram Bridge',
		`.card { width: min(420px, 100%); }
    .actions { display: grid; gap: 12px; margin-top: 18px; }
    .btn { width: 100%; }
    #watch-result {
      margin-top: 12px; padding: 10px 14px;
      border-radius: 10px; font-size: 14px; display: none;
    }
    #watch-result.ok { display: block; background: #064e3b; color: var(--ok); }
    #watch-result.err { display: block; background: #7f1d1d; color: var(--danger); }`,
		`<main class="card">
    <h1>Dashboard</h1>
    <p>选择一个操作</p>
    <div class="actions">
      <a class="btn btn-primary" href="${escapeHtml(oauthUrl)}">开始 Google OAuth 授权</a>
      <button class="btn btn-secondary" id="watch-btn" type="button">刷新 Gmail Watch</button>
    </div>
    <div id="watch-result"></div>
  </main>
  <script>
    document.getElementById('watch-btn').addEventListener('click', async function () {
      const btn = this, res = document.getElementById('watch-result');
      btn.disabled = true; btn.textContent = '请求中…';
      try {
        const r = await fetch('${watchUrl}', { method: 'POST' });
        const t = await r.text();
        res.textContent = t; res.className = r.ok ? 'ok' : 'err';
      } catch {
        res.textContent = '网络错误'; res.className = 'err';
      } finally { btn.disabled = false; btn.textContent = '刷新 Gmail Watch'; }
    });
  </script>`,
	);
	return htmlResponse(html);
}
