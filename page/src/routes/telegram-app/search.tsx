import { Skeleton, Spinner } from "@heroui/react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { api, extractErrorMessage } from "@/api/client";
import { ROUTE_MINI_APP_API_SEARCH } from "@/api/routes";
import { mailSearchResponseSchema } from "@/api/schemas";
import { useBackButton } from "@/hooks/use-back-button";
import { getTelegram } from "@/providers/telegram";

export const Route = createFileRoute("/telegram-app/search")({
  component: SearchPage,
});

function SearchPage() {
  // 搜索页是从邮件键盘进入的根页 —— 不显示 BackButton（关闭走 TG 自带的 ✕）
  useBackButton(undefined);

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const searchMut = useMutation({
    mutationFn: async (q: string) => {
      const data = await api
        .get(ROUTE_MINI_APP_API_SEARCH.replace(/^\//, ""), {
          searchParams: { q },
        })
        .json();
      return mailSearchResponseSchema.parse(data);
    },
    onError: async (err) => {
      setError(await extractErrorMessage(err));
      getTelegram()?.HapticFeedback?.notificationOccurred("error");
    },
    onSuccess: () => {
      setError(null);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setError(null);
    searchMut.mutate(q);
  }

  function openMail(id: string, accountId: number, token: string) {
    const back = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    window.location.href = `/telegram-app/mail/${encodeURIComponent(id)}?accountId=${accountId}&t=${encodeURIComponent(token)}&back=${back}`;
  }

  const data = searchMut.data;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <h1 className="text-xl font-semibold text-zinc-100">🔍 搜索邮件</h1>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="search"
          enterKeyHint="search"
          placeholder="关键词、发件人、主题…"
          maxLength={200}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-[15px] outline-none focus:border-emerald-500 placeholder:text-zinc-600 transition-colors"
        />
        <button
          type="submit"
          disabled={searchMut.isPending || !input.trim()}
          className="px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center min-w-[68px]"
        >
          {searchMut.isPending ? <Spinner size="sm" /> : "搜索"}
        </button>
      </form>

      <div
        className={`text-[13px] min-h-[18px] ${
          error ? "text-red-400" : "text-zinc-500"
        }`}
      >
        {error ??
          (data
            ? `找到 ${data.total} 封匹配 “${data.query}”`
            : "支持跨所有账号检索（Gmail / Outlook 走原生搜索语法）")}
      </div>

      {searchMut.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3"
            >
              <Skeleton className="h-4 w-1/3 rounded-md" />
              <Skeleton className="h-3 w-full rounded-md" />
              <Skeleton className="h-3 w-5/6 rounded-md" />
            </div>
          ))}
        </div>
      ) : !data ? null : !data.total ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-10 text-center text-sm text-zinc-500">
          无匹配邮件
        </div>
      ) : (
        data.results.map((r) => {
          if (r.error) {
            return (
              <AccountBox
                key={r.accountId}
                errored
                label={r.accountEmail || `Account #${r.accountId}`}
              >
                <div className="px-4 py-3 text-sm text-red-400">
                  搜索失败：{r.error}
                </div>
              </AccountBox>
            );
          }
          if (!r.total) return null;
          return (
            <AccountBox
              key={r.accountId}
              label={r.accountEmail || `Account #${r.accountId}`}
              count={r.total}
            >
              <ul className="divide-y divide-zinc-800">
                {r.items.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => openMail(it.id, r.accountId, it.token)}
                      className="block w-full text-left px-4 py-3 text-sm text-zinc-100 break-words hover:bg-zinc-800/60 active:bg-zinc-800 transition-colors"
                    >
                      {it.title || "(无主题)"}
                    </button>
                  </li>
                ))}
              </ul>
            </AccountBox>
          );
        })
      )}
    </div>
  );
}

function AccountBox({
  label,
  count,
  errored,
  children,
}: {
  label: string;
  count?: number;
  errored?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div
        className={`flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] bg-zinc-950/30 border-b border-zinc-800 ${
          errored ? "text-red-400" : "text-zinc-400"
        }`}
      >
        <span className="truncate font-medium">{label}</span>
        {count != null && (
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
