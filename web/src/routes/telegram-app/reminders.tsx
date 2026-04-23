import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { api, extractErrorMessage } from "@/lib/api";
import {
  ROUTE_REMINDERS_API,
  ROUTE_REMINDERS_API_EMAIL_CONTEXT,
} from "@/lib/routes";
import {
  emailContextResponseSchema,
  okResponseSchema,
  type Reminder,
  remindersListResponseSchema,
} from "@/lib/schemas";
import { getTelegram } from "@/lib/tg";

// 三件套任缺其一 → 退化为"所有待提醒"列表模式。用 fallback 吞掉格式错误，
// 避免脏 URL 让整页崩在 errorComponent。
const searchSchema = z.object({
  accountId: fallback(z.coerce.number().optional(), undefined),
  emailMessageId: fallback(z.string().optional(), undefined),
  token: fallback(z.string().optional(), undefined),
});

type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/telegram-app/reminders")({
  component: RemindersPage,
  validateSearch: zodValidator(searchSchema),
});

const PRESETS: { label: string; mins: number | "tonight20" | "tomorrow9" }[] = [
  { label: "10 分钟", mins: 10 },
  { label: "30 分钟", mins: 30 },
  { label: "1 小时", mins: 60 },
  { label: "3 小时", mins: 180 },
  { label: "今晚 20:00", mins: "tonight20" },
  { label: "明早 09:00", mins: "tomorrow9" },
];

function fmt2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())}`;
}
function hm(d: Date): string {
  return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`;
}
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())} ${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`;
}
function presetToDate(kind: (typeof PRESETS)[number]["mins"]): Date {
  if (kind === "tomorrow9") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (kind === "tonight20") {
    const d = new Date();
    d.setHours(20, 0, 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    return d;
  }
  return new Date(Date.now() + kind * 60_000);
}

function RemindersPage() {
  const search: Search = Route.useSearch();
  const listOnly = !search.accountId || !search.emailMessageId || !search.token;

  const qc = useQueryClient();
  const [status, setStatus] = useState<{
    msg: string;
    kind: "ok" | "error" | "info";
  } | null>(null);
  const [date, setDate] = useState<string>(() =>
    ymd(new Date(Date.now() + 60_000)),
  );
  const [time, setTime] = useState<string>(() =>
    hm(new Date(Date.now() + 60_000)),
  );
  const [text, setText] = useState("");
  const [activePreset, setActivePreset] = useState<number | null>(null);

  // 邮件模式 → 拉 email 上下文展示卡片；列表模式跳过
  const emailCtx = useQuery({
    queryKey: [
      "email-context",
      search.accountId,
      search.emailMessageId,
      search.token,
    ],
    enabled: !listOnly,
    queryFn: async () => {
      const data = await api
        .get(ROUTE_REMINDERS_API_EMAIL_CONTEXT.replace(/^\//, ""), {
          searchParams: {
            accountId: String(search.accountId),
            emailMessageId: search.emailMessageId ?? "",
            token: search.token ?? "",
          },
        })
        .json();
      return emailContextResponseSchema.parse(data);
    },
  });

  // 提醒列表：有 email 上下文就按该邮件过滤，否则拉用户全部
  const remindersKey = useMemo(
    () =>
      listOnly
        ? ["reminders", "all"]
        : ["reminders", search.accountId, search.emailMessageId, search.token],
    [listOnly, search.accountId, search.emailMessageId, search.token],
  );

  const remindersQuery = useQuery({
    queryKey: remindersKey,
    queryFn: async () => {
      const searchParams: Record<string, string> = {};
      if (!listOnly) {
        searchParams.accountId = String(search.accountId);
        searchParams.emailMessageId = search.emailMessageId ?? "";
        searchParams.token = search.token ?? "";
      }
      const data = await api
        .get(ROUTE_REMINDERS_API.replace(/^\//, ""), { searchParams })
        .json();
      return remindersListResponseSchema.parse(data);
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const localDt = new Date(`${date}T${time}`);
      if (Number.isNaN(localDt.getTime())) throw new Error("时间格式错误");
      if (localDt.getTime() <= Date.now()) throw new Error("提醒时间需在未来");
      const data = await api
        .post(ROUTE_REMINDERS_API.replace(/^\//, ""), {
          json: {
            text: text.trim(),
            remind_at: localDt.toISOString(),
            accountId: search.accountId,
            emailMessageId: search.emailMessageId,
            token: search.token,
          },
        })
        .json();
      const parsed = okResponseSchema.parse(data);
      if (!parsed.ok) throw new Error(parsed.error || "保存失败");
      return parsed;
    },
    onSuccess: () => {
      setStatus({ msg: "✅ 已设定提醒", kind: "ok" });
      setText("");
      const d = new Date(Date.now() + 60_000);
      setDate(ymd(d));
      setTime(hm(d));
      setActivePreset(null);
      getTelegram()?.HapticFeedback?.notificationOccurred("success");
      qc.invalidateQueries({ queryKey: remindersKey });
    },
    onError: async (err) => {
      setStatus({ msg: await extractErrorMessage(err), kind: "error" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api
        .delete(`${ROUTE_REMINDERS_API.replace(/^\//, "")}/${id}`)
        .json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: remindersKey }),
    onError: async (err) =>
      setStatus({ msg: await extractErrorMessage(err), kind: "error" }),
  });

  function applyPreset(idx: number) {
    const d = presetToDate(PRESETS[idx].mins);
    setDate(ymd(d));
    setTime(hm(d));
    setActivePreset(idx);
  }

  // 点击邮件卡片跳到预览页
  function openMail() {
    if (listOnly) return;
    const back = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    window.location.href =
      `/telegram-app/mail/${encodeURIComponent(search.emailMessageId ?? "")}` +
      `?accountId=${search.accountId}&t=${encodeURIComponent(search.token ?? "")}&back=${back}`;
  }

  // 邮件模式下最小日期限 = 今天（防止选过去）
  const minDate = ymd(new Date());

  // 隐藏 BackButton（root 页，从 mail 页返回后可能残留显示）
  useEffect(() => {
    getTelegram()?.BackButton?.hide();
  }, []);

  const reminders = remindersQuery.data?.reminders ?? [];

  return (
    <div
      className="wrap"
      style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: "4px 0 16px" }}>
        {listOnly ? "⏰ 我的提醒" : "⏰ 邮件提醒"}
      </h1>

      {!listOnly && (
        <EmailCard
          subject={emailCtx.data?.subject ?? null}
          accountEmail={emailCtx.data?.accountEmail ?? null}
          loading={emailCtx.isLoading}
          error={emailCtx.isError}
          onClick={openMail}
        />
      )}

      {!listOnly && (
        <AddSection
          date={date}
          time={time}
          text={text}
          minDate={minDate}
          activePreset={activePreset}
          saving={createMut.isPending}
          status={status}
          onDateChange={setDate}
          onTimeChange={setTime}
          onTextChange={setText}
          onPreset={applyPreset}
          onSave={() => {
            setStatus({ msg: "保存中…", kind: "info" });
            createMut.mutate();
          }}
        />
      )}

      <ListSection
        listOnly={listOnly}
        reminders={reminders}
        loading={remindersQuery.isLoading}
        onDelete={(id) => deleteMut.mutate(id)}
      />
    </div>
  );
}

function EmailCard({
  subject,
  accountEmail,
  loading,
  error,
  onClick,
}: {
  subject: string | null;
  accountEmail: string | null;
  loading: boolean;
  error: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="email-card"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "12px 14px",
        borderLeft: "3px solid var(--button)",
        borderTop: 0,
        borderRight: 0,
        borderBottom: 0,
        background: "var(--surface)",
        borderRadius: 8,
        marginBottom: 14,
        cursor: "pointer",
        color: "inherit",
        fontFamily: "inherit",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, wordBreak: "break-word" }}>
        {loading
          ? "加载中…"
          : error
            ? "邮件信息加载失败"
            : subject || "(无主题)"}
      </div>
      {accountEmail && (
        <div style={{ fontSize: 12, color: "var(--hint)", marginTop: 2 }}>
          账号: {accountEmail}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--button)", marginTop: 6 }}>
        点击查看邮件 →
      </div>
    </button>
  );
}

function AddSection({
  date,
  time,
  text,
  minDate,
  activePreset,
  saving,
  status,
  onDateChange,
  onTimeChange,
  onTextChange,
  onPreset,
  onSave,
}: {
  date: string;
  time: string;
  text: string;
  minDate: string;
  activePreset: number | null;
  saving: boolean;
  status: { msg: string; kind: "ok" | "error" | "info" } | null;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  onTextChange: (v: string) => void;
  onPreset: (idx: number) => void;
  onSave: () => void;
}) {
  return (
    <div
      className="section"
      style={{
        background: "var(--surface)",
        borderRadius: 14,
        padding: 14,
        marginBottom: 14,
      }}
    >
      <label
        htmlFor="when-date"
        style={{
          display: "block",
          fontSize: 13,
          color: "var(--hint)",
          marginBottom: 6,
        }}
      >
        提醒时间
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          id="when-date"
          type="date"
          value={date}
          min={minDate}
          onChange={(e) => onDateChange(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 auto" }}
        />
        <input
          id="when-time"
          type="time"
          value={time}
          onChange={(e) => onTimeChange(e.target.value)}
          style={{ ...inputStyle, flex: "0 0 38%" }}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 4,
        }}
      >
        {PRESETS.map((p, i) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onPreset(i)}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: activePreset === i ? "var(--button)" : "transparent",
              color: activePreset === i ? "var(--button-text)" : "var(--text)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <label
        htmlFor="text"
        style={{
          display: "block",
          fontSize: 13,
          color: "var(--hint)",
          margin: "14px 0 6px",
        }}
      >
        备注（可选）
      </label>
      <textarea
        id="text"
        maxLength={1000}
        placeholder="可留空 —— 不填只发送邮件主题和链接"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
      />

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        style={{
          width: "100%",
          padding: 13,
          border: "none",
          borderRadius: 12,
          background: "var(--button)",
          color: "var(--button-text)",
          fontSize: 16,
          fontWeight: 600,
          cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.5 : 1,
          marginTop: 14,
        }}
      >
        保存提醒
      </button>
      <div
        style={{
          marginTop: 10,
          fontSize: 13,
          minHeight: 18,
          color:
            status?.kind === "error"
              ? "var(--danger)"
              : status?.kind === "ok"
                ? "#22c55e"
                : "var(--text)",
        }}
      >
        {status?.msg ?? ""}
      </div>
      <div style={{ color: "var(--hint)", fontSize: 12, marginTop: 6 }}>
        时间按你设备的本地时区
      </div>
    </div>
  );
}

function ListSection({
  listOnly,
  reminders,
  loading,
  onDelete,
}: {
  listOnly: boolean;
  reminders: Reminder[];
  loading: boolean;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      className="section"
      style={{
        background: "var(--surface)",
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 13, color: "var(--hint)", marginBottom: 6 }}>
        {listOnly ? "所有待提醒" : "已设的提醒"}
        {reminders.length > 0 && <span> ({reminders.length})</span>}
      </div>
      {loading ? (
        <div style={{ color: "var(--hint)", fontSize: 13, padding: "6px 0" }}>
          加载中…
        </div>
      ) : reminders.length === 0 ? (
        <div style={{ color: "var(--hint)", fontSize: 13, padding: "6px 0" }}>
          {listOnly ? "暂无待提醒事项" : "本邮件还没有设过提醒"}
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {reminders.map((it) => (
            <li
              key={it.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: "1px solid var(--border)",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--hint)",
                    marginBottom: 2,
                  }}
                >
                  {fmtWhen(it.remind_at)}
                </div>
                {listOnly && it.email_subject && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--hint)",
                      marginTop: 2,
                      wordBreak: "break-word",
                    }}
                  >
                    📧 {it.email_subject}
                  </div>
                )}
                {it.text && (
                  <div style={{ fontSize: 14, wordBreak: "break-word" }}>
                    {it.text}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDelete(it.id)}
                title="删除"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--danger)",
                  fontSize: 18,
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 15,
  fontFamily: "inherit",
  outline: "none",
  WebkitAppearance: "none",
  appearance: "none",
  minWidth: 0,
};
