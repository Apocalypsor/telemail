import { Button, Card, Spinner } from "@heroui/react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  api,
  extractErrorMessage,
  redirectToLoginOnUnauthorized,
} from "@/api/client";
import { ROUTE_JUNK_CHECK_API } from "@/api/routes";
import { junkCheckResponseSchema } from "@/api/schemas";

export const Route = createFileRoute("/junk-check")({
  component: JunkCheckPage,
});

function JunkCheckPage() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      const raw = await api
        .post(ROUTE_JUNK_CHECK_API.replace(/^\//, ""), {
          json: { subject, body },
        })
        .json();
      return junkCheckResponseSchema.parse(raw);
    },
    onMutate: () => setError(null),
    onError: async (err) => {
      if (redirectToLoginOnUnauthorized(err)) return;
      setError(await extractErrorMessage(err));
    },
  });

  const result = mut.data;
  const showJunk = result && !result.error && result.isJunk;
  const showOk = result && !result.error && !result.isJunk;

  return (
    <div className="min-h-screen p-6 flex justify-center">
      <Card className="w-full max-w-2xl p-6">
        <h1 className="text-2xl font-bold text-[color:var(--foreground)] mb-1">
          🚫 垃圾邮件检测
        </h1>
        <p className="text-sm text-[color:var(--muted)] mb-4">
          输入邮件主题和正文，AI 判断是否为垃圾邮件
        </p>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="subject-input"
              className="block text-sm text-[color:var(--muted)] mb-1"
            >
              主题
            </label>
            <input
              id="subject-input"
              type="text"
              placeholder="邮件主题（可选）"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full p-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--field-background)] text-[color:var(--field-foreground)] text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent)]/40"
            />
          </div>
          <div>
            <label
              htmlFor="body-input"
              className="block text-sm text-[color:var(--muted)] mb-1"
            >
              正文
            </label>
            <textarea
              id="body-input"
              placeholder="粘贴邮件正文内容…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full min-h-[200px] p-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--field-background)] text-[color:var(--field-foreground)] text-sm resize-y outline-none focus:ring-2 focus:ring-[color:var(--accent)]/40"
            />
          </div>
        </div>

        <Button
          onClick={() => mut.mutate()}
          isDisabled={mut.isPending || !body.trim()}
          variant="primary"
          className="mt-4"
        >
          {mut.isPending ? <Spinner size="sm" /> : "检测"}
        </Button>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-[color:var(--surface-secondary)] text-sm text-[color:var(--danger)]">
            {error}
          </div>
        )}
        {result?.error && (
          <div className="mt-4 p-3 rounded-lg bg-[color:var(--surface-secondary)] text-sm text-[color:var(--danger)]">
            错误: {result.error}
          </div>
        )}
        {(showJunk || showOk) && (
          <div
            className={`mt-4 p-4 rounded-lg border ${
              showJunk
                ? "bg-red-950/40 border-red-800"
                : "bg-emerald-950/40 border-emerald-800"
            }`}
          >
            <div className="text-lg font-bold mb-1">
              {showJunk ? "🚫 垃圾邮件" : "✅ 正常邮件"}
            </div>
            <div className="text-sm text-[color:var(--muted)] mb-1">
              置信度: {Math.round(result.junkConfidence * 100)}%
            </div>
            {result.tags.length > 0 && (
              <div className="text-sm text-[color:var(--muted)] mb-2">
                标签: {result.tags.join(", ")}
              </div>
            )}
            {result.summary && (
              <div className="text-sm text-[color:var(--foreground)] whitespace-pre-wrap">
                {result.summary}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
