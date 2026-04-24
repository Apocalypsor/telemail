import { useEffect, useRef } from "react";

/**
 * 邮件正文用 sandbox iframe 渲染：邮件自带 `<style>` / `body{...}` 等全局选择
 * 器隔离在 iframe 文档里，防止泄漏到外层。`<base target="_blank">` 让链接走新
 * 窗口。不开 `allow-scripts`，邮件里的 JS 一律不跑。
 *
 * 父组件通过 onLoad 读 `contentDocument.scrollHeight` 动态调 iframe 高度
 * （img onload + ResizeObserver + window resize 各触发一次）。
 */
export function MailBodyFrame({ bodyHtml }: { bodyHtml: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const f = frameRef.current;
    if (!f) return;

    function resize() {
      try {
        const doc = f?.contentDocument;
        if (!doc || !f) return;
        const h = Math.max(
          doc.documentElement?.scrollHeight ?? 0,
          doc.body?.scrollHeight ?? 0,
        );
        if (h > 0) f.style.height = `${h}px`;
      } catch {
        /* cross-origin (shouldn't happen with srcdoc) */
      }
    }

    const observers: ResizeObserver[] = [];
    function onLoad() {
      resize();
      try {
        const doc = f?.contentDocument;
        if (!doc) return;
        doc.querySelectorAll("img").forEach((img) => {
          if (!img.complete) {
            img.addEventListener("load", resize);
            img.addEventListener("error", resize);
          }
        });
        if (doc.documentElement) {
          const ro = new ResizeObserver(resize);
          ro.observe(doc.documentElement);
          observers.push(ro);
        }
      } catch {
        /* ignore */
      }
    }

    f.addEventListener("load", onLoad);
    window.addEventListener("resize", resize);
    return () => {
      f.removeEventListener("load", onLoad);
      window.removeEventListener("resize", resize);
      for (const o of observers) o.disconnect();
    };
  }, []);

  const srcDoc = `<base target="_blank">${bodyHtml}`;
  return (
    <iframe
      ref={frameRef}
      title="邮件正文"
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      style={{
        width: "100%",
        border: 0,
        display: "block",
        background: "#fff",
        colorScheme: "light",
      }}
    />
  );
}
