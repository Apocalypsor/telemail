import { Spinner } from "@heroui/react";
import { api } from "@page/api/client";
import { extractErrorMessage } from "@page/api/utils";
import { useBackButton } from "@page/hooks/use-back-button";
import { useMainButton } from "@page/hooks/use-bottom-button";
import { INPUT_CLASS } from "@page/styles/inputs";
import { THEME_COLORS } from "@page/styles/theme";
import { alertPopup, notifyHaptic } from "@page/utils/tg";
import { useMutation, useQuery } from "@tanstack/react-query";
import { isTMA } from "@telegram-apps/sdk-react";
import type { AccountResponse } from "@worker/api/modules/accounts/model";
import type { MailGetResponse } from "@worker/api/modules/mail/model";
import { useEffect, useMemo, useState } from "react";
import type { ComposeSearch } from "../-utils/types";

type ComposeAccountsData = {
  accounts: AccountResponse[];
  currentUserId: string;
  canViewAll: boolean;
};

export const ComposePage = ({ search }: { search: ComposeSearch }) => {
  const inTelegramMiniApp = isTMA();
  const replyMode = Boolean(search.replyEmailMessageId && search.token);
  const [accountId, setAccountId] = useState<number | null>(
    search.accountId ?? null,
  );
  const [to, setTo] = useState(search.to ?? "");
  const [subject, setSubject] = useState(search.subject ?? "");
  const [body, setBody] = useState("");
  const [sourceApplied, setSourceApplied] = useState(false);
  const [status, setStatus] = useState<{
    msg: string;
    kind: "ok" | "error";
  } | null>(null);

  useBackButton(search.back ?? "/telegram-app/reminders");

  const accountsQuery = useQuery<ComposeAccountsData>({
    queryKey: COMPOSE_ACCOUNTS_QUERY_KEY,
    queryFn: async (): Promise<ComposeAccountsData> => {
      const { data, error } = await api.api.compose.accounts.get();
      if (error) throw error;
      return data as unknown as ComposeAccountsData;
    },
  });

  const sourceQuery = useQuery<MailGetResponse>({
    queryKey: [
      "compose",
      "source",
      search.accountId,
      search.replyEmailMessageId,
      search.token,
      search.folder,
    ],
    enabled:
      replyMode &&
      !!search.accountId &&
      !!search.replyEmailMessageId &&
      !!search.token &&
      (!search.to || !search.subject),
    queryFn: async (): Promise<MailGetResponse> => {
      const sourceAccountId = search.accountId;
      const sourceMessageId = search.replyEmailMessageId;
      const sourceToken = search.token;
      if (!sourceAccountId || !sourceMessageId || !sourceToken) {
        throw new Error("缺少回复上下文");
      }
      const { data, error } = await api.api.mail({ id: sourceMessageId }).get({
        query: {
          accountId: String(sourceAccountId),
          t: sourceToken,
          ...(search.folder ? { folder: search.folder } : {}),
        },
      });
      if (error) throw error;
      return data as MailGetResponse;
    },
  });

  const accounts = accountsQuery.data?.accounts ?? [];
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId) ?? null,
    [accounts, accountId],
  );
  const replyAccount = useMemo(
    () =>
      replyMode && search.accountId
        ? (accounts.find((account) => account.id === search.accountId) ?? null)
        : null,
    [accounts, replyMode, search.accountId],
  );

  useEffect(() => {
    if (accounts.length === 0) return;
    if (replyMode) {
      const matched = search.accountId
        ? accounts.find((account) => account.id === search.accountId)
        : null;
      if (matched && accountId !== matched.id) setAccountId(matched.id);
      return;
    }
    if (accountId && accounts.some((account) => account.id === accountId)) {
      return;
    }
    const preferred = search.accountId
      ? accounts.find((account) => account.id === search.accountId)
      : null;
    setAccountId(preferred?.id ?? accounts[0].id);
  }, [accounts, accountId, replyMode, search.accountId]);

  useEffect(() => {
    const source = sourceQuery.data;
    if (sourceApplied || !source) return;
    if (!to.trim()) setTo(source.replyRecipients.join(", "));
    if (!subject.trim()) setSubject(buildReplySubject(source.meta.subject));
    setSourceApplied(true);
  }, [sourceApplied, sourceQuery.data, subject, to]);

  const replyResetSubject = useMemo(() => {
    if (search.subject?.trim()) return search.subject;
    const sourceSubject = sourceQuery.data?.meta.subject;
    return sourceSubject ? buildReplySubject(sourceSubject) : "";
  }, [search.subject, sourceQuery.data?.meta.subject]);

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!accountId) throw new Error("请选择发件账号");
      const replySource =
        replyMode && search.replyEmailMessageId && search.token
          ? {
              emailMessageId: search.replyEmailMessageId,
              token: search.token,
              ...(search.folder ? { folder: search.folder } : {}),
            }
          : undefined;

      const { data, error } = await api.api.compose.send.post({
        accountId,
        to,
        subject,
        body,
        ...(replySource ? { replySource } : {}),
      });
      if (error) throw error;
      if (!data?.ok) throw new Error("发送失败");
      return data;
    },
    onSuccess: async (data) => {
      setBody("");
      setStatus({ msg: data.message, kind: "ok" });
      notifyHaptic("success");
      await alertPopup(data.message);
    },
    onError: async (err) => {
      const msg = await extractErrorMessage(err);
      setStatus({ msg, kind: "error" });
      notifyHaptic("error");
    },
  });

  const busy =
    accountsQuery.isLoading || sourceQuery.isLoading || sendMut.isPending;
  const senderUnavailable = replyMode && !replyAccount;
  const submitDisabled =
    !accountId ||
    senderUnavailable ||
    !body.trim() ||
    (!replyMode && !to.trim()) ||
    busy;

  const submit = () => {
    if (submitDisabled) return;
    setStatus(null);
    sendMut.mutate();
  };

  useMainButton({
    text: "发送",
    onClick: submit,
    loading: sendMut.isPending,
    disabled: submitDisabled,
    color: THEME_COLORS.accent,
    textColor: THEME_COLORS.accentOn,
  });

  return (
    <div className="max-w-xl mx-auto px-3 py-4 sm:p-6 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            {replyMode ? "回复邮件" : "写邮件"}
          </h1>
          <div className="mt-1 text-xs text-zinc-500 truncate">
            {selectedAccount
              ? accountLabel(selectedAccount)
              : accounts.length > 0
                ? ""
                : " "}
          </div>
        </div>
        {replyMode && (
          <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
            Reply
          </span>
        )}
      </header>

      {status && (
        <output
          aria-live="polite"
          className={`block rounded-lg border px-4 py-2.5 text-sm font-medium ${
            status.kind === "error"
              ? "border-red-900/60 bg-red-950/40 text-red-300"
              : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
          }`}
        >
          {status.msg}
        </output>
      )}

      {sourceQuery.isError && <ErrorBox error={sourceQuery.error} />}

      {accountsQuery.isLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900">
          <Spinner size="lg" color="success" />
        </div>
      ) : accountsQuery.isError ? (
        <ErrorBox error={accountsQuery.error} />
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500">
          暂无可写邮件账号
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              发件账号
            </span>
            {replyMode ? (
              <div
                className={`w-full text-[15px] ${INPUT_CLASS} ${
                  senderUnavailable ? "text-red-300" : "text-zinc-200"
                }`}
              >
                {replyAccount
                  ? accountLabel(replyAccount)
                  : "原收件账号暂不支持回复"}
              </div>
            ) : (
              <select
                value={accountId ?? ""}
                onChange={(event) => setAccountId(Number(event.target.value))}
                disabled={busy}
                className={`w-full text-[15px] ${INPUT_CLASS}`}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountLabel(account)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              收件人
            </span>
            <input
              type="text"
              inputMode="email"
              autoComplete="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="name@example.com"
              disabled={busy}
              className={`w-full text-[15px] ${INPUT_CLASS}`}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              主题
            </span>
            <input
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Subject"
              disabled={busy}
              className={`w-full text-[15px] ${INPUT_CLASS}`}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              正文
            </span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={12}
              disabled={busy}
              className={`min-h-56 w-full resize-y text-[15px] leading-6 ${INPUT_CLASS}`}
            />
          </label>

          <div className="flex gap-2 pt-1">
            {!inTelegramMiniApp && (
              <button
                type="submit"
                disabled={submitDisabled}
                className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-emerald-950 transition-[colors,transform] active:scale-[0.98] active:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
              >
                {sendMut.isPending ? <Spinner size="sm" /> : "发送"}
              </button>
            )}
            <button
              type="button"
              disabled={busy || (!to && !subject && !body)}
              onClick={() => {
                if (!replyMode) setTo("");
                setSubject(replyMode ? replyResetSubject : "");
                setBody("");
                setStatus(null);
              }}
              className="min-h-11 rounded-lg border border-zinc-800 px-4 text-sm font-semibold text-zinc-300 transition-colors active:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              清空
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

const accountLabel = (account: AccountResponse): string => {
  return account.email || `#${account.id}`;
};

const buildReplySubject = (subject: string | null | undefined): string => {
  const base = subject?.trim() || "(no subject)";
  return /^\s*re\s*:/i.test(base) ? base : `Re: ${base}`;
};

const ErrorBox = ({ error }: { error: unknown }) => {
  const [message, setMessage] = useState("加载失败");

  useEffect(() => {
    let cancelled = false;
    extractErrorMessage(error).then((msg) => {
      if (!cancelled) setMessage(msg);
    });
    return () => {
      cancelled = true;
    };
  }, [error]);

  return (
    <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-5 text-sm text-red-300">
      {message}
    </div>
  );
};

const COMPOSE_ACCOUNTS_QUERY_KEY = ["compose", "accounts"] as const;
