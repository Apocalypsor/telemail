import { Button, Card, Spinner } from "@heroui/react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  api,
  extractErrorMessage,
  redirectToLoginOnUnauthorized,
} from "@/api/client";
import { ROUTE_PREVIEW_API } from "@/api/routes";
import { previewResponseSchema } from "@/api/schemas";

export const Route = createFileRoute("/preview")({
  component: PreviewPage,
});

function PreviewPage() {
  const [html, setHtml] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [length, setLength] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      const raw = await api
        .post(ROUTE_PREVIEW_API.replace(/^\//, ""), { json: { html } })
        .json();
      return previewResponseSchema.parse(raw);
    },
    onSuccess: (data) => {
      setResult(data.result);
      setLength(data.length);
      setError(null);
    },
    onError: async (err) => {
      if (redirectToLoginOnUnauthorized(err)) return;
      setError(await extractErrorMessage(err));
    },
  });

  return (
    <div className="min-h-screen p-6 flex justify-center">
      <Card className="w-full max-w-5xl p-6">
        <h1 className="text-2xl font-bold text-[color:var(--foreground)] mb-1">
          HTML → Telegram 预览
        </h1>
        <p className="text-sm text-[color:var(--muted)] mb-4">
          粘贴邮件 HTML，查看处理后发送到 Telegram 的 MarkdownV2 结果
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="html-input"
              className="block text-sm text-[color:var(--muted)] mb-1.5"
            >
              输入 HTML
            </label>
            <textarea
              id="html-input"
              placeholder="<html>...</html>"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              className="w-full min-h-[300px] p-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--field-background)] text-[color:var(--field-foreground)] font-mono text-xs resize-y outline-none focus:ring-2 focus:ring-[color:var(--accent)]/40"
            />
          </div>
          <div>
            <span className="block text-sm text-[color:var(--muted)] mb-1.5">
              输出 MarkdownV2
            </span>
            <div className="min-h-[300px] p-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--field-background)] text-[color:var(--field-foreground)] font-mono text-xs whitespace-pre-wrap break-all overflow-auto">
              {result ?? (
                <span className="text-[color:var(--muted)]">
                  （结果将显示在这里）
                </span>
              )}
            </div>
          </div>
        </div>

        <Button
          onClick={() => mut.mutate()}
          isDisabled={mut.isPending || !html.trim()}
          variant="primary"
          className="mt-4"
        >
          {mut.isPending ? <Spinner size="sm" /> : "转换"}
        </Button>
        {length != null && !error && (
          <div className="mt-2 text-xs text-[color:var(--muted)]">
            长度: {length} 字符
          </div>
        )}
        {error && (
          <div className="mt-2 text-xs text-[color:var(--danger)]">{error}</div>
        )}
      </Card>
    </div>
  );
}
