import { ROUTE_GMAIL_WATCH, ROUTE_OAUTH_GOOGLE } from '../constants';
import type { Account } from '../types';
import { BackLink, Card, Layout } from './layout';

export function HomePage({ error }: { error?: string }) {
	return (
		<Layout title="Gmail → Telegram Bridge">
			<Card class="max-w-md">
				<h1 class="text-2xl font-bold text-slate-100 mb-3">Gmail → Telegram Bridge</h1>
				<p class="text-sm text-slate-400">请输入密钥以继续</p>
				{error && <p class="text-sm text-red-400 mt-3">{error}</p>}
				<form method="post" action="/" class="mt-4 space-y-3">
					<label for="secret" class="block text-sm text-slate-400">
						Secret
					</label>
					<input
						id="secret"
						name="secret"
						type="password"
						placeholder="GMAIL_WATCH_SECRET"
						required
						autofocus
						class="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm outline-none focus:border-blue-500 transition-colors"
					/>
					<button type="submit" class="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors">
						进入
					</button>
				</form>
			</Card>
		</Layout>
	);
}

function dashboardScript(secret: string) {
	const watchAllUrl = `${ROUTE_GMAIL_WATCH}?secret=${encodeURIComponent(secret)}`;
	return `
var res = document.getElementById('action-result');
function showResult(text, ok) {
  res.textContent = text;
  res.className = ok
    ? 'mt-3 p-3 rounded-lg text-sm bg-emerald-900/50 text-emerald-300'
    : 'mt-3 p-3 rounded-lg text-sm bg-red-900/50 text-red-300';
}

document.getElementById('watch-all-btn').addEventListener('click', async function () {
  var btn = this;
  btn.disabled = true; btn.textContent = '请求中…';
  try {
    var r = await fetch('${watchAllUrl}', { method: 'POST' });
    showResult(await r.text(), r.ok);
  } catch { showResult('网络错误', false); }
  finally { btn.disabled = false; btn.textContent = 'Renew All Watches'; }
});

document.querySelectorAll('.watch-btn').forEach(function (btn) {
  btn.addEventListener('click', async function () {
    var id = this.dataset.id;
    this.disabled = true; this.textContent = '…';
    try {
      var r = await fetch('/accounts/' + id + '/watch?secret=${encodeURIComponent(secret)}', { method: 'POST' });
      showResult(await r.text(), r.ok);
    } catch { showResult('网络错误', false); }
    finally { this.disabled = false; this.textContent = 'Watch'; }
  });
});

document.querySelectorAll('.delete-btn').forEach(function (btn) {
  btn.addEventListener('click', async function () {
    if (!confirm('确定要删除这个账号吗？')) return;
    var id = this.dataset.id;
    this.disabled = true;
    try {
      var r = await fetch('/accounts/' + id + '/delete?secret=${encodeURIComponent(secret)}', { method: 'POST' });
      if (r.ok) location.reload();
      else showResult(await r.text(), false);
    } catch { showResult('网络错误', false); }
    finally { this.disabled = false; }
  });
});`;
}

export function DashboardPage({ secret, accounts, error }: { secret: string; accounts: Account[]; error?: string }) {
	const esc = (s: string) => encodeURIComponent(s);

	return (
		<Layout title="Dashboard — Gmail → Telegram Bridge">
			<Card class="max-w-4xl">
				<h1 class="text-2xl font-bold text-slate-100 mb-1">Dashboard</h1>
				<p class="text-sm text-slate-400 mb-4">管理 Gmail 账号和 Telegram 转发</p>

				{error && <p class="text-sm text-red-400 mb-3 p-3 bg-red-900/30 rounded-lg">{error}</p>}

				{/* ── 账号列表 ─────────────────────────────────────────── */}
				<h2 class="text-lg font-semibold text-slate-100 mb-2">Accounts</h2>

				{accounts.length === 0 ? (
					<p class="text-sm text-slate-500 mb-4">还没有账号，请在下方添加。</p>
				) : (
					<div class="space-y-2 mb-4">
						{accounts.map((acc) => (
							<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-900 border border-slate-700 rounded-lg">
								<div class="min-w-0">
									<p class="text-sm text-slate-200 font-medium truncate">{acc.label ? `${acc.label} — ${acc.email}` : acc.email}</p>
									<p class="text-xs text-slate-500">Chat ID: {acc.chat_id}</p>
								</div>
								<div class="flex items-center gap-1.5 flex-shrink-0">
									<span
										class={`text-xs px-2 py-0.5 rounded ${acc.refresh_token ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/50 text-amber-300'}`}
									>
										{acc.refresh_token ? '已授权' : '未授权'}
									</span>
									<a
										class="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
										href={`${ROUTE_OAUTH_GOOGLE}?secret=${esc(secret)}&account=${acc.id}`}
									>
										{acc.refresh_token ? '重新授权' : '授权'}
									</a>
									{acc.refresh_token && (
										<button class="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors watch-btn" data-id={String(acc.id)} type="button">
											Watch
										</button>
									)}
									<button class="text-xs px-2 py-1 bg-red-700 hover:bg-red-800 text-white rounded transition-colors delete-btn" data-id={String(acc.id)} type="button">
										删除
									</button>
								</div>
							</div>
						))}
					</div>
				)}

				{/* ── 添加账号 ─────────────────────────────────────────── */}
				<h2 class="text-lg font-semibold text-slate-100 mt-5 mb-2">Add Account</h2>
				<form method="post" action={`/accounts?secret=${esc(secret)}`} class="space-y-3">
					<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
						<div>
							<label class="block text-xs text-slate-400 mb-1">Email *</label>
							<input
								name="email"
								type="email"
								required
								placeholder="user@gmail.com"
								class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm outline-none focus:border-blue-500 transition-colors"
							/>
						</div>
						<div>
							<label class="block text-xs text-slate-400 mb-1">Telegram Chat ID *</label>
							<input
								name="chat_id"
								required
								placeholder="-1001234567890"
								class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm outline-none focus:border-blue-500 transition-colors"
							/>
						</div>
						<div>
							<label class="block text-xs text-slate-400 mb-1">Label</label>
							<input
								name="label"
								placeholder="Personal"
								class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm outline-none focus:border-blue-500 transition-colors"
							/>
						</div>
					</div>
					<button type="submit" class="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors text-sm">
						添加账号
					</button>
				</form>

				{/* ── 全局操作 ─────────────────────────────────────────── */}
				<div class="border-t border-slate-700 mt-6 pt-4 flex flex-wrap gap-3">
					<button
						id="watch-all-btn"
						type="button"
						class="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-lg transition-colors text-sm"
					>
						Renew All Watches
					</button>
					<a
						class="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-lg text-center transition-colors text-sm"
						href={`/preview?secret=${esc(secret)}`}
					>
						HTML → Telegram 预览
					</a>
				</div>

				<div id="action-result" class="hidden" />
			</Card>
			<script dangerouslySetInnerHTML={{ __html: dashboardScript(secret) }} />
		</Layout>
	);
}

function previewScript(secret: string) {
	const url = `/preview?secret=${encodeURIComponent(secret)}`;
	return `
document.getElementById('convert-btn').addEventListener('click', async function () {
  var btn = this;
  var html = document.getElementById('html-input').value;
  if (!html.trim()) return;
  btn.disabled = true; btn.textContent = '转换中…';
  try {
    var r = await fetch('${url}', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ html: html }),
    });
    var data = await r.json();
    document.getElementById('output').textContent = data.result;
    document.getElementById('meta').textContent = '长度: ' + data.length + ' 字符';
  } catch {
    document.getElementById('output').textContent = '请求失败';
  } finally { btn.disabled = false; btn.textContent = '转换'; }
});`;
}

export function PreviewPage({ secret }: { secret: string }) {
	return (
		<Layout title="HTML Preview — Gmail → Telegram Bridge">
			<Card class="max-w-5xl">
				<h1 class="text-2xl font-bold text-slate-100 mb-3">HTML → Telegram 预览</h1>
				<p class="text-sm text-slate-400">粘贴邮件 HTML，查看处理后发送到 Telegram 的 MarkdownV2 结果</p>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
					<div>
						<label for="html-input" class="block text-sm text-slate-400 mb-1.5">
							输入 HTML
						</label>
						<textarea
							id="html-input"
							placeholder="<html>...</html>"
							class="w-full min-h-[300px] p-3 bg-slate-900 border border-slate-700 rounded-lg text-blue-300 font-mono text-xs resize-y outline-none focus:border-blue-500 transition-colors"
						/>
					</div>
					<div>
						<label class="block text-sm text-slate-400 mb-1.5">输出 MarkdownV2</label>
						<div
							id="output"
							class="min-h-[300px] p-3 bg-slate-900 border border-slate-700 rounded-lg text-blue-300 font-mono text-xs whitespace-pre-wrap break-all overflow-auto"
						>
							（结果将显示在这里）
						</div>
					</div>
				</div>
				<button
					class="mt-3 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
					id="convert-btn"
					type="button"
				>
					转换
				</button>
				<div id="meta" class="mt-2 text-xs text-slate-400" />
				<BackLink secret={secret} />
			</Card>
			<script dangerouslySetInnerHTML={{ __html: previewScript(secret) }} />
		</Layout>
	);
}
