import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { useMemo, useState } from "react";
import { z } from "zod";
import { api, extractErrorMessage } from "@/lib/api";
import {
  MAIL_LIST_TITLES,
  MAIL_LIST_TYPES,
  ROUTE_MINI_APP_API_LIST,
  ROUTE_MINI_APP_API_MARK_ALL_READ,
  ROUTE_MINI_APP_API_TRASH_ALL_JUNK,
} from "@/lib/routes";
import {
  bulkActionResponseSchema,
  type MailListType,
  mailListResponseSchema,
  mailListTypeSchema,
} from "@/lib/schemas";
import { getTelegram } from "@/lib/tg";

interface BulkAction {
  label: string;
  url: string;
  confirmText: string;
  loadingText: string;
  danger?: boolean;
}

const BULK_ACTIONS: Partial<Record<MailListType, BulkAction>> = {
  unread: {
    label: "✓ 全部已读",
    url: ROUTE_MINI_APP_API_MARK_ALL_READ,
    confirmText: "把所有未读邮件标记为已读？",
    loadingText: "标记中…",
  },
  junk: {
    label: "🗑 清空垃圾",
    url: ROUTE_MINI_APP_API_TRASH_ALL_JUNK,
    confirmText: "清空所有账号的垃圾邮件？此操作不可撤销。",
    loadingText: "清理中…",
    danger: true,
  },
};

const searchSchema = z.object({
  cache: fallback(z.coerce.boolean().optional(), undefined),
});

export const Route = createFileRoute("/telegram-app/list/$type")({
  component: MailListPage,
  validateSearch: zodValidator(searchSchema),
  beforeLoad: ({ params }) => {
    if (!MAIL_LIST_TYPES.includes(params.type as MailListType)) {
      throw notFound();
    }
  },
});

function MailListPage() {
  const { type: typeParam } = Route.useParams();
  const type = mailListTypeSchema.parse(typeParam);
  const bulk = BULK_ACTIONS[type];

  const qc = useQueryClient();
  const [meta, setMeta] = useState<{
    msg: string;
    kind: "ok" | "error" | "";
  } | null>(null);

  // junk/archived 列表：mail 页 fetch 需要 folder 提示给 IMAP 定位 UID
  const folderHint = useMemo(
    () => (type === "junk" ? "junk" : type === "archived" ? "archive" : ""),
    [type],
  );

  const listQuery = useQuery({
    queryKey: ["mail-list", type],
    queryFn: async () => {
      const data = await api
        .get(ROUTE_MINI_APP_API_LIST.replace(":type", type).replace(/^\//, ""))
        .json();
      return mailListResponseSchema.parse(data);
    },
  });

  const bulkMut = useMutation({
    mutationFn: async () => {
      if (!bulk) throw new Error("no bulk action");
      const data = await api.post(bulk.url.replace(/^\//, "")).json();
      return bulkActionResponseSchema.parse(data);
    },
    onSuccess: (data) => {
      const msg =
        `✅ 成功 ${data.success} 封` +
        (data.failed > 0 ? `，❌ ${data.failed} 封失败` : "");
      setMeta({ msg, kind: "ok" });
      getTelegram()?.HapticFeedback?.notificationOccurred(
        data.failed > 0 ? "warning" : "success",
      );
      qc.invalidateQueries({ queryKey: ["mail-list", type] });
    },
    onError: async (err) =>
      setMeta({ msg: await extractErrorMessage(err), kind: "error" }),
  });

  function handleBulk() {
    if (!bulk) return;
    const tg = getTelegram();
    const run = () => {
      setMeta({ msg: bulk.loadingText, kind: "" });
      bulkMut.mutate();
    };
    if (tg?.showConfirm) {
      tg.showConfirm(bulk.confirmText, (ok) => {
        if (ok) run();
      });
    } else if (window.confirm(bulk.confirmText)) {
      run();
    }
  }

  function openMail(id: string, accountId: number, token: string) {
    const back = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    const folder = folderHint ? `&folder=${folderHint}` : "";
    window.location.href = `/telegram-app/mail/${encodeURIComponent(id)}?accountId=${accountId}&t=${encodeURIComponent(token)}${folder}&back=${back}`;
  }

  const data = listQuery.data;
  const isError = listQuery.isError;
  const isRefreshing = listQuery.isFetching;

  return (
    <div
      className="wrap"
      style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: "4px 0" }}>
          {MAIL_LIST_TITLES[type]}
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {bulk && (
            <button
              type="button"
              onClick={handleBulk}
              disabled={bulkMut.isPending}
              style={{
                padding: "6px 12px",
                borderRadius: 16,
                background: "transparent",
                border: `1px solid ${bulk.danger ? "rgba(239,68,68,.35)" : "var(--separator)"}`,
                color: bulk.danger ? "var(--danger)" : "var(--link)",
                fontSize: 13,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                cursor: bulkMut.isPending ? "default" : "pointer",
                opacity: bulkMut.isPending ? 0.4 : 1,
              }}
            >
              {bulk.label}
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              qc.invalidateQueries({ queryKey: ["mail-list", type] })
            }
            title="强制刷新"
            aria-label="强制刷新"
            style={{
              width: 32,
              height: 32,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              background: "transparent",
              border: "1px solid var(--separator)",
              color: "var(--link)",
              fontSize: 18,
              lineHeight: 1,
              cursor: "pointer",
              animation: isRefreshing ? "spin 1s linear infinite" : undefined,
            }}
          >
            ↻
          </button>
        </div>
      </div>

      <div
        style={{
          fontSize: 13,
          color:
            meta?.kind === "error"
              ? "var(--danger)"
              : meta?.kind === "ok"
                ? "#22c55e"
                : "var(--hint)",
          margin: "8px 0 12px",
          minHeight: 18,
        }}
      >
        {meta?.msg ?? (data?.total != null ? `共 ${data.total} 封` : "")}
      </div>

      {listQuery.isLoading ? (
        <div
          style={{
            textAlign: "center",
            padding: "28px 16px",
            color: "var(--hint)",
            fontSize: 14,
          }}
        >
          加载中…
        </div>
      ) : isError ? (
        <div
          style={{
            textAlign: "center",
            padding: "28px 16px",
            color: "var(--danger)",
            fontSize: 14,
          }}
        >
          查询失败
        </div>
      ) : !data?.total ? (
        <div
          style={{
            textAlign: "center",
            padding: "28px 16px",
            color: "var(--hint)",
            fontSize: 14,
          }}
        >
          暂无邮件
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
                <span>查询失败</span>
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
              {r.items.map((it) => (
                <button
                  type="button"
                  key={it.id}
                  onClick={() => openMail(it.id, r.accountId, it.token)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 14px",
                    background: "transparent",
                    border: 0,
                    borderTop: "1px solid var(--separator)",
                    color: "inherit",
                    cursor: "pointer",
                    fontSize: 14,
                    wordBreak: "break-word",
                    fontFamily: "inherit",
                  }}
                >
                  {it.title || "(无主题)"}
                </button>
              ))}
            </AccountBox>
          );
        })
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 14,
        padding: "6px 0",
        marginBottom: 14,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          fontSize: 13,
          color: errored ? "var(--danger)" : "var(--hint)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{label}</span>
        {count != null && (
          <span style={{ color: "var(--link)", fontWeight: 600 }}>{count}</span>
        )}
        {errored && !count && children}
      </div>
      {!errored && children}
    </div>
  );
}
