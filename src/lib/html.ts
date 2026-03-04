export const BASE_CSS = `
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --text: #e2e8f0;
      --muted: #94a3b8;
      --line: #334155;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --mono-bg: #0f172a;
      --mono-text: #93c5fd;
      --ok: #6ee7b7;
      --warn: #fbbf24;
      --danger: #f87171;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
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
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    }
    h1 { margin: 0 0 12px; font-size: 28px; line-height: 1.2; color: #f1f5f9; }
    h2 { margin: 18px 0 8px; font-size: 20px; color: #f1f5f9; }
    p, li { font-size: 15px; line-height: 1.6; color: var(--muted); }
    strong { color: var(--text); }
    code {
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      background: var(--mono-bg);
      padding: 2px 6px;
      border-radius: 6px;
      color: var(--mono-text);
      word-break: break-all;
    }
    pre {
      background: var(--mono-bg);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      overflow: auto;
      font-size: 13px;
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      color: var(--mono-text);
    }
    .btn {
      display: inline-block;
      padding: 12px 16px;
      border: 0;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      transition: background-color .2s ease;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-secondary { background: var(--line); color: var(--text); }
    .btn-secondary:hover { background: #475569; }
`;

export function htmlPage(title: string, extraStyles: string, body: string): string {
	return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    ${BASE_CSS}
    ${extraStyles}
  </style>
</head>
<body>${body}</body>
</html>`;
}

export function htmlResponse(html: string, status = 200): Response {
	return new Response(html, {
		status,
		headers: {
			'content-type': 'text/html; charset=UTF-8',
			'cache-control': 'no-store',
		},
	});
}

export function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}
