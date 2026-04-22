/**
 * 邮件正文用 sandbox iframe 渲染（web + miniapp 共用），把邮件自带的 `<style>`
 * /`body{...}` 等全局选择器隔离在 iframe 文档里，防止泄漏到外层页面（污染 meta
 * 标题等）。`<base target="_blank">` 让链接走新窗口，避免覆盖父窗口。
 *
 * 父页面通过 `contentDocument` 读 scrollHeight 调高度（imgs onload + parent
 * ResizeObserver + window resize）；不开 `allow-scripts`，邮件内的脚本一律不跑。
 */
const MAIL_BODY_FRAME_SCRIPT = `
(function () {
  var f = document.getElementById('mail-body-frame');
  if (!f) return;
  function resize() {
    try {
      var doc = f.contentDocument;
      if (!doc) return;
      var h = Math.max(
        doc.documentElement ? doc.documentElement.scrollHeight : 0,
        doc.body ? doc.body.scrollHeight : 0
      );
      if (h > 0) f.style.height = h + 'px';
    } catch (e) {}
  }
  f.addEventListener('load', function () {
    resize();
    try {
      var doc = f.contentDocument;
      if (!doc) return;
      doc.querySelectorAll('img').forEach(function (img) {
        if (!img.complete) {
          img.addEventListener('load', resize);
          img.addEventListener('error', resize);
        }
      });
      if (window.ResizeObserver && doc.documentElement) {
        new ResizeObserver(resize).observe(doc.documentElement);
      }
    } catch (e) {}
  });
  window.addEventListener('resize', resize);
})();
`.trim();

export function MailBodyFrame({ bodyHtml }: { bodyHtml: string }) {
  // <base target="_blank"> 让邮件里的 a 标签默认开新窗口；rel 不能在 base 上，
  // 所以下面 sandbox 里加 allow-popups-to-escape-sandbox 让弹出窗口脱离 sandbox 限制。
  const srcdoc = `<base target="_blank">${bodyHtml}`;
  return (
    <>
      <iframe
        id="mail-body-frame"
        title="邮件正文"
        srcdoc={srcdoc}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        style="width:100%;border:0;display:block;background:#fff;color-scheme:light"
      />
      <script dangerouslySetInnerHTML={{ __html: MAIL_BODY_FRAME_SCRIPT }} />
    </>
  );
}
