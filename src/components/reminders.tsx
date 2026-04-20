import { ROUTE_REMINDERS_API } from "@handlers/hono/routes";

const REMINDERS_CSS = `
:root {
  color-scheme: light dark;
  --bg: var(--tg-theme-bg-color, #0f172a);
  --surface: var(--tg-theme-secondary-bg-color, #1e293b);
  --text: var(--tg-theme-text-color, #e2e8f0);
  --hint: var(--tg-theme-hint-color, #94a3b8);
  --button: var(--tg-theme-button-color, #3b82f6);
  --button-text: var(--tg-theme-button-text-color, #ffffff);
  --link: var(--tg-theme-link-color, #60a5fa);
  --danger: #ef4444;
  --border: rgba(127,127,127,.18);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 15px;
  line-height: 1.5;
  -webkit-tap-highlight-color: transparent;
}
.wrap { max-width: 560px; margin: 0 auto; padding: 16px; }
h1 { font-size: 20px; font-weight: 600; margin: 4px 0 16px; }
.section { background: var(--surface); border-radius: 14px; padding: 14px; margin-bottom: 14px; }
label, .section-title { display: block; font-size: 13px; color: var(--hint); margin-bottom: 6px; }
input[type="text"], input[type="datetime-local"], textarea {
  width: 100%; padding: 11px 12px; border-radius: 10px;
  border: 1px solid var(--border); background: var(--bg); color: var(--text);
  font-size: 15px; font-family: inherit; outline: none;
}
textarea { min-height: 80px; resize: vertical; }
input:focus, textarea:focus { border-color: var(--button); }
.presets { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.preset {
  padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border);
  background: transparent; color: var(--text); font-size: 13px; cursor: pointer;
}
.preset:active { background: var(--button); color: var(--button-text); }
.preset.active { background: var(--button); color: var(--button-text); border-color: var(--button); }
.btn-primary {
  width: 100%; padding: 13px; border: none; border-radius: 12px;
  background: var(--button); color: var(--button-text);
  font-size: 16px; font-weight: 600; cursor: pointer;
}
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.status { margin-top: 10px; font-size: 13px; min-height: 18px; }
.status.error { color: var(--danger); }
.status.ok { color: #22c55e; }
.list { list-style: none; padding: 0; margin: 0; }
.list li {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0; border-bottom: 1px solid var(--border); gap: 10px;
}
.list li:last-child { border-bottom: 0; }
.list .meta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.list .meta .when { font-size: 12px; color: var(--hint); margin-bottom: 2px; }
.list .meta .text { font-size: 14px; word-break: break-word; }
.list .del {
  background: transparent; border: none; color: var(--danger);
  font-size: 18px; cursor: pointer; padding: 4px 8px;
}
.empty { color: var(--hint); font-size: 13px; padding: 6px 0; }
.helper { color: var(--hint); font-size: 12px; margin-top: 6px; }
`;

function remindersScript(): string {
  return `
(function(){
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }
  var initData = (tg && tg.initData) || "";

  var $ = function(id){ return document.getElementById(id); };
  var fmt2 = function(n){ return n < 10 ? "0" + n : "" + n; };

  // 当前时间 + 1 分钟，作为初始默认值（避免一打开就是过去）
  function defaultLocal() {
    var d = new Date(Date.now() + 60000);
    return d.getFullYear() + "-" + fmt2(d.getMonth()+1) + "-" + fmt2(d.getDate())
      + "T" + fmt2(d.getHours()) + ":" + fmt2(d.getMinutes());
  }
  $("when").value = defaultLocal();
  $("when").min = defaultLocal();

  function applyPreset(mins, btn) {
    var d;
    if (mins === "tomorrow9") {
      d = new Date(); d.setDate(d.getDate()+1); d.setHours(9,0,0,0);
    } else if (mins === "tonight20") {
      d = new Date(); d.setHours(20,0,0,0);
      if (d.getTime() < Date.now()) d.setDate(d.getDate()+1);
    } else {
      d = new Date(Date.now() + Number(mins) * 60000);
    }
    $("when").value = d.getFullYear() + "-" + fmt2(d.getMonth()+1) + "-" + fmt2(d.getDate())
      + "T" + fmt2(d.getHours()) + ":" + fmt2(d.getMinutes());
    Array.prototype.forEach.call(document.querySelectorAll(".preset"), function(b){ b.classList.remove("active"); });
    if (btn) btn.classList.add("active");
  }
  Array.prototype.forEach.call(document.querySelectorAll(".preset"), function(btn){
    btn.addEventListener("click", function(){ applyPreset(btn.dataset.mins, btn); });
  });

  function setStatus(msg, kind) {
    var s = $("status");
    s.textContent = msg || "";
    s.className = "status" + (kind ? " " + kind : "");
  }

  function fmtWhen(iso) {
    var d = new Date(iso);
    return d.getFullYear() + "-" + fmt2(d.getMonth()+1) + "-" + fmt2(d.getDate())
      + " " + fmt2(d.getHours()) + ":" + fmt2(d.getMinutes());
  }

  function renderList(items) {
    var ul = $("list");
    ul.innerHTML = "";
    if (!items.length) {
      var e = document.createElement("div");
      e.className = "empty"; e.textContent = "暂无待提醒事项";
      ul.appendChild(e); return;
    }
    items.forEach(function(it){
      var li = document.createElement("li");
      var meta = document.createElement("div"); meta.className = "meta";
      var when = document.createElement("div"); when.className = "when"; when.textContent = fmtWhen(it.remind_at);
      var text = document.createElement("div"); text.className = "text"; text.textContent = it.text;
      meta.appendChild(when); meta.appendChild(text);
      var del = document.createElement("button");
      del.className = "del"; del.type = "button"; del.title = "删除"; del.textContent = "🗑";
      del.addEventListener("click", function(){ deleteItem(it.id, li); });
      li.appendChild(meta); li.appendChild(del);
      ul.appendChild(li);
    });
  }

  async function loadList() {
    try {
      var r = await fetch("${ROUTE_REMINDERS_API}", { headers: { "x-telegram-init-data": initData } });
      if (!r.ok) throw new Error("加载失败");
      var d = await r.json();
      renderList(d.reminders || []);
    } catch (e) {
      $("list").innerHTML = '<div class="empty">加载失败</div>';
    }
  }

  async function deleteItem(id, li) {
    try {
      var r = await fetch("${ROUTE_REMINDERS_API}/" + id, {
        method: "DELETE", headers: { "x-telegram-init-data": initData },
      });
      if (!r.ok) throw new Error();
      li.remove();
      var ul = $("list");
      if (!ul.querySelector("li")) {
        ul.innerHTML = '<div class="empty">暂无待提醒事项</div>';
      }
    } catch (e) {
      setStatus("删除失败", "error");
    }
  }

  $("save").addEventListener("click", async function(){
    var text = $("text").value.trim();
    var when = $("when").value;
    if (!text) { setStatus("请填写提醒内容", "error"); return; }
    if (!when) { setStatus("请选择时间", "error"); return; }
    var local = new Date(when);
    if (isNaN(local.getTime())) { setStatus("时间格式错误", "error"); return; }
    if (local.getTime() <= Date.now()) { setStatus("提醒时间需在未来", "error"); return; }

    $("save").disabled = true;
    setStatus("保存中…");
    try {
      var r = await fetch("${ROUTE_REMINDERS_API}", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-init-data": initData,
        },
        body: JSON.stringify({ text: text, remind_at: local.toISOString() }),
      });
      var data = await r.json().catch(function(){ return {}; });
      if (!r.ok || !data.ok) {
        setStatus(data.error || "保存失败", "error");
        return;
      }
      setStatus("✅ 已设定提醒", "ok");
      $("text").value = "";
      $("when").value = defaultLocal();
      Array.prototype.forEach.call(document.querySelectorAll(".preset"), function(b){ b.classList.remove("active"); });
      loadList();
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
    } catch (e) {
      setStatus("网络错误", "error");
    } finally {
      $("save").disabled = false;
    }
  });

  loadList();
})();
`;
}

export function RemindersPage() {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <title>提醒 — Telemail</title>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <script src="https://telegram.org/js/telegram-web-app.js" />
        <style dangerouslySetInnerHTML={{ __html: REMINDERS_CSS }} />
      </head>
      <body>
        <div class="wrap">
          <h1>⏰ 设置提醒</h1>

          <div class="section">
            <label for="text">提醒内容</label>
            <textarea
              id="text"
              maxlength={1000}
              placeholder="例如：取快递、吃药、开会..."
            />

            <label for="when" style="margin-top:12px">
              提醒时间
            </label>
            <input id="when" type="datetime-local" />
            <div class="presets">
              <button type="button" class="preset" data-mins="10">
                10 分钟
              </button>
              <button type="button" class="preset" data-mins="30">
                30 分钟
              </button>
              <button type="button" class="preset" data-mins="60">
                1 小时
              </button>
              <button type="button" class="preset" data-mins="180">
                3 小时
              </button>
              <button type="button" class="preset" data-mins="tonight20">
                今晚 20:00
              </button>
              <button type="button" class="preset" data-mins="tomorrow9">
                明早 09:00
              </button>
            </div>
            <div class="helper">时间按你设备的本地时区</div>

            <button
              id="save"
              type="button"
              class="btn-primary"
              style="margin-top:14px"
            >
              保存
            </button>
            <div id="status" class="status" />
          </div>

          <div class="section">
            <div class="section-title">待提醒</div>
            <ul id="list" class="list">
              <div class="empty">加载中…</div>
            </ul>
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: remindersScript() }} />
      </body>
    </html>
  );
}
