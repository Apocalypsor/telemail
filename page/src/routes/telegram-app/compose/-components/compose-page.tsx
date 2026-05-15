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
import Prism from "prismjs";
import "prismjs/components/prism-markdown";
import { marked } from "marked";
import type { Token as PrismToken } from "prismjs";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { ComposeAccountsData, ComposeSearch } from "../-types";

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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [status, setStatus] = useState<{
    msg: string;
    kind: "ok" | "error";
  } | null>(null);
  const editorSurfaceRef = useRef<HTMLDivElement>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);

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

  const optimizeMut = useMutation({
    mutationFn: async () => {
      const replySource =
        replyMode && search.replyEmailMessageId && search.token
          ? {
              emailMessageId: search.replyEmailMessageId,
              token: search.token,
              ...(search.folder ? { folder: search.folder } : {}),
            }
          : undefined;

      const { data, error } = await api.api.compose.optimize.post({
        ...(accountId ? { accountId } : {}),
        ...(replySource ? { replySource } : {}),
        subject,
        body,
        replyMode,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      setBody(data.body);
      if (data.subject) setSubject(data.subject);
      setPreviewOpen(true);
      notifyHaptic("success");
    },
    onError: async (err) => {
      const msg = await extractErrorMessage(err);
      setStatus({ msg, kind: "error" });
      notifyHaptic("error");
    },
  });

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
      setPreviewOpen(false);
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
    accountsQuery.isLoading ||
    sourceQuery.isLoading ||
    sendMut.isPending ||
    optimizeMut.isPending;
  const senderUnavailable = replyMode && !replyAccount;
  const submitDisabled =
    !accountId ||
    senderUnavailable ||
    !body.trim() ||
    (!replyMode && !to.trim()) ||
    busy;
  const optimizeDisabled =
    !body.trim() ||
    busy ||
    (replyMode && (!accountId || !search.replyEmailMessageId || !search.token));

  const submit = () => {
    if (submitDisabled) return;
    setStatus(null);
    sendMut.mutate();
  };

  useEffect(() => {
    const surface = editorSurfaceRef.current;
    const textarea = editorTextareaRef.current;
    if (!surface || !textarea) return;
    surface.scrollTop = textarea.scrollTop;
    surface.scrollLeft = textarea.scrollLeft;
  });

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
        </div>
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
            <div
              className={`relative h-[420px] overflow-hidden rounded-xl border ${
                previewOpen
                  ? "border-sky-500/40 bg-zinc-900"
                  : "border-zinc-800 bg-zinc-950"
              } transition-colors focus-within:border-emerald-500/60 focus-within:ring-1 focus-within:ring-emerald-500/30`}
            >
              <div
                ref={editorSurfaceRef}
                aria-hidden="true"
                className={`absolute inset-0 overflow-auto px-4 py-3 text-[15px] leading-6 ${
                  previewOpen
                    ? "font-sans text-zinc-200"
                    : "font-mono text-zinc-200"
                }`}
              >
                <MarkdownEditorSurface
                  markdown={body}
                  mode={previewOpen ? "preview" : "syntax"}
                />
              </div>
              <textarea
                ref={editorTextareaRef}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onScroll={(event) => {
                  const surface = editorSurfaceRef.current;
                  if (!surface) return;
                  surface.scrollTop = event.currentTarget.scrollTop;
                  surface.scrollLeft = event.currentTarget.scrollLeft;
                }}
                disabled={busy}
                readOnly={previewOpen}
                spellCheck={false}
                aria-label="正文 Markdown 编辑器"
                className={`absolute inset-0 z-10 h-full w-full resize-none overflow-auto border-0 bg-transparent px-4 py-3 font-mono text-[15px] leading-6 text-transparent caret-emerald-300 outline-none selection:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50 ${
                  previewOpen ? "pointer-events-none" : ""
                }`}
              />
            </div>
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => setPreviewOpen((value) => !value)}
              className="min-h-11 rounded-lg border border-zinc-800 px-4 text-sm font-semibold text-zinc-300 transition-colors active:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {previewOpen ? "隐藏预览" : "预览"}
            </button>
            <button
              type="button"
              disabled={optimizeDisabled}
              onClick={() => {
                setStatus(null);
                optimizeMut.mutate();
              }}
              className="min-h-11 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 text-sm font-semibold text-sky-300 transition-colors active:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="flex items-center gap-1.5">
                {optimizeMut.isPending && <Spinner size="sm" />}
                <span>{optimizeMut.isPending ? "优化中…" : "LLM 优化"}</span>
              </span>
            </button>
            <button
              type="button"
              disabled={busy || (!to && !subject && !body)}
              onClick={() => {
                if (!replyMode) setTo("");
                setSubject(replyMode ? replyResetSubject : "");
                setBody("");
                setPreviewOpen(false);
                setStatus(null);
              }}
              className="min-h-11 rounded-lg border border-zinc-800 px-4 text-sm font-semibold text-zinc-300 transition-colors active:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              清空
            </button>
            {!inTelegramMiniApp && (
              <button
                type="submit"
                disabled={submitDisabled}
                className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-emerald-950 transition-[colors,transform] active:scale-[0.98] active:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
              >
                {sendMut.isPending ? <Spinner size="sm" /> : "发送"}
              </button>
            )}
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

const MarkdownEditorSurface = ({
  markdown,
  mode,
}: {
  markdown: string;
  mode: "syntax" | "preview";
}) => {
  if (!markdown.trim()) {
    return (
      <div className="text-zinc-600">
        {mode === "preview"
          ? "这里会显示 Markdown 预览"
          : "支持 Markdown：**加粗**、[链接](https://...)、- 列表"}
      </div>
    );
  }

  if (mode === "preview") return <MarkdownPreview markdown={markdown} />;
  return <MarkdownSyntax markdown={markdown} />;
};

const MarkdownSyntax = ({ markdown }: { markdown: string }) => {
  const tokens = useMemo(() => {
    const normalized = markdown.replace(/\r\n/g, "\n");
    return Prism.tokenize(normalized, Prism.languages.markdown);
  }, [markdown]);

  return (
    <pre className="min-h-full whitespace-pre-wrap break-words font-mono text-[15px] leading-6 text-zinc-200">
      {renderPrismTokens(tokens, "syntax")}
    </pre>
  );
};

const renderPrismTokens = (
  tokens: Array<string | PrismToken>,
  path: string,
): ReactNode[] => {
  return tokens.flatMap((token, index) =>
    renderPrismToken(token, `${path}-${index}`),
  );
};

const renderPrismToken = (
  token: string | PrismToken,
  path: string,
): ReactNode[] => {
  if (typeof token === "string") {
    return token ? [token] : [];
  }

  const children = Array.isArray(token.content)
    ? renderPrismTokens(
        token.content as Array<string | PrismToken>,
        `${path}-c`,
      )
    : typeof token.content === "string"
      ? [token.content]
      : [];

  switch (token.type) {
    case "title":
      return [
        <span key={path} className="text-emerald-400">
          {children}
        </span>,
      ];
    case "blockquote":
      return [
        <span key={path} className="text-amber-200">
          {children}
        </span>,
      ];
    case "list":
      return [
        <span key={path} className="text-sky-300">
          {children}
        </span>,
      ];
    case "bold":
    case "strong":
      return [
        <span key={path} className="font-semibold text-zinc-50">
          {children}
        </span>,
      ];
    case "italic":
      return [
        <span key={path} className="italic text-fuchsia-200">
          {children}
        </span>,
      ];
    case "code-snippet":
    case "code":
      return [
        <span
          key={path}
          className="rounded bg-zinc-900 px-1 py-0.5 text-emerald-300"
        >
          {children}
        </span>,
      ];
    case "url":
      return [
        <span key={path} className="text-sky-300">
          {children}
        </span>,
      ];
    case "punctuation":
      return [
        <span key={path} className="text-zinc-500">
          {children}
        </span>,
      ];
    case "hr":
      return [
        <span key={path} className="text-zinc-700">
          {children}
        </span>,
      ];
    default:
      return [
        <span key={path} className="text-zinc-200">
          {children}
        </span>,
      ];
  }
};

const MarkdownPreview = ({ markdown }: { markdown: string }) => {
  const nodes = useMemo(() => {
    if (typeof document === "undefined") return [];
    const html = String(
      marked.parse(escapeMarkdownHtml(markdown.replace(/\r\n/g, "\n")), {
        breaks: true,
        gfm: true,
      }) as string,
    );
    const template = document.createElement("template");
    template.innerHTML = html;
    return renderMarkdownNodes(template.content.childNodes, "preview");
  }, [markdown]);

  return (
    <div className="min-h-full space-y-3 break-words text-zinc-200 leading-6">
      {nodes}
    </div>
  );
};

const escapeMarkdownHtml = (value: string): string => {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
};

const renderMarkdownNodes = (
  nodes: ArrayLike<ChildNode>,
  path: string,
): ReactNode[] => {
  return Array.from(nodes).flatMap((node, index) =>
    renderMarkdownNode(node, `${path}-${index}`),
  );
};

const renderMarkdownNode = (node: ChildNode, path: string): ReactNode[] => {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text ? [text] : [];
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const children = renderMarkdownNodes(element.childNodes, `${path}-${tag}`);

  switch (tag) {
    case "h1":
      return [
        <h1 key={path} className="text-2xl font-bold text-zinc-50">
          {children}
        </h1>,
      ];
    case "h2":
      return [
        <h2 key={path} className="text-xl font-semibold text-zinc-50">
          {children}
        </h2>,
      ];
    case "h3":
      return [
        <h3 key={path} className="text-lg font-semibold text-zinc-50">
          {children}
        </h3>,
      ];
    case "h4":
    case "h5":
    case "h6":
      return [
        <div key={path} className="text-base font-semibold text-zinc-50">
          {children}
        </div>,
      ];
    case "p":
      return [
        <p key={path} className="text-zinc-200">
          {children}
        </p>,
      ];
    case "blockquote":
      return [
        <blockquote
          key={path}
          className="border-l-2 border-zinc-700 pl-4 italic text-zinc-300"
        >
          {children}
        </blockquote>,
      ];
    case "ul":
      return [
        <ul key={path} className="list-disc space-y-1 pl-5 text-zinc-200">
          {children}
        </ul>,
      ];
    case "ol":
      return [
        <ol key={path} className="list-decimal space-y-1 pl-5 text-zinc-200">
          {children}
        </ol>,
      ];
    case "li":
      return [
        <li key={path} className="text-zinc-200">
          {children}
        </li>,
      ];
    case "strong":
      return [
        <strong key={path} className="font-semibold text-zinc-50">
          {children}
        </strong>,
      ];
    case "em":
      return [
        <em key={path} className="italic">
          {children}
        </em>,
      ];
    case "a":
      return [
        <a
          key={path}
          href={element.getAttribute("href") ?? "#"}
          target="_blank"
          rel="noreferrer noopener"
          className="text-sky-300 underline"
        >
          {children}
        </a>,
      ];
    case "code": {
      if (element.parentElement?.tagName.toLowerCase() === "pre") {
        return [
          <code key={path} className="text-zinc-100">
            {element.textContent ?? ""}
          </code>,
        ];
      }
      return [
        <code
          key={path}
          className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[0.92em] text-emerald-200"
        >
          {children}
        </code>,
      ];
    }
    case "pre": {
      const codeText = element.textContent ?? "";
      return [
        <pre
          key={path}
          className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-100"
        >
          <code>{codeText}</code>
        </pre>,
      ];
    }
    case "hr":
      return [<hr key={path} className="border-zinc-800" />];
    case "br":
      return [<br key={path} />];
    case "img":
      return [
        <img
          key={path}
          src={element.getAttribute("src") ?? ""}
          alt={element.getAttribute("alt") ?? ""}
          className="max-w-full rounded-md border border-zinc-800"
        />,
      ];
    case "tbody":
    case "thead":
    case "tr":
    case "td":
    case "th":
      return children;
    default:
      return children;
  }
};

const COMPOSE_ACCOUNTS_QUERY_KEY = ["compose", "accounts"] as const;
