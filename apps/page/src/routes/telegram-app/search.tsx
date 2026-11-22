import { Spinner } from "@heroui/react";
import { api } from "@page/api/client";
import { extractErrorMessage, validateSearch } from "@page/api/utils";
import {
  MailListAddressMeta,
  MailListFlat,
} from "@page/components/mail-list-flat";
import { MailListSkeleton } from "@page/components/mail-list-skeleton";
import { useBackButton } from "@page/hooks/use-back-button";
import { useInfiniteScrollSentinel } from "@page/hooks/use-infinite-scroll-sentinel";
import { useNavigateToMail } from "@page/hooks/use-navigate-to-mail";
import { INPUT_CLASS } from "@page/styles/inputs";
import {
  collectMailListErrors,
  encodeMailListCursor,
  flattenMailListPages,
  getNextMailListCursor,
  MAIL_LIST_PAGE_SIZE,
  type MailListCursor,
} from "@page/utils/mail-list-pagination";
import { Type as t } from "@sinclair/typebox";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

interface AdvancedSearchFields {
  from: string;
  to: string;
  subject: string;
  after: string;
  before: string;
  location: "" | "inbox" | "spam" | "trash" | "archive";
  hasAttachment: boolean;
  isUnread: boolean;
  isStarred: boolean;
}

const SearchPage = () => {
  const { q: urlQ } = Route.useSearch();
  const navigate = useNavigate();
  const navigateToMail = useNavigateToMail();

  // 搜索页是从主菜单进入的根页 —— 不显示 BackButton
  useBackButton(undefined);

  // input 是 URL 的可编辑镜像。URL 变化时同步过来（含从 mail 页回退到这里的场景）。
  const [input, setInput] = useState(urlQ ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advanced, setAdvanced] = useState<AdvancedSearchFields>(
    EMPTY_ADVANCED_SEARCH,
  );
  useEffect(() => {
    setInput(urlQ ?? "");
  }, [urlQ]);

  const q = (urlQ ?? "").trim();

  const searchQuery = useInfiniteQuery({
    queryKey: ["search", q],
    enabled: q.length > 0,
    initialPageParam: undefined as MailListCursor | undefined,
    // 搜索结果在用户停留期间认为是新鲜的；切回页面不重新打 provider
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async ({ pageParam }) => {
      const cursor = encodeMailListCursor(pageParam);
      const { data, error } = await api.api["mini-app"].search.get({
        query: {
          q,
          limit: MAIL_LIST_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        },
      });
      if (error) throw error;
      return data;
    },
    getNextPageParam: getNextMailListCursor,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = buildGmailSearchQuery(input, advanced);
    if (!next || next === q) return;
    navigate({ to: "/telegram-app/search", search: { q: next } });
  };

  const pages = searchQuery.data?.pages;
  const firstPage = pages?.[0];
  const items = flattenMailListPages(pages);
  const accountErrors = collectMailListErrors(pages);
  const handleLoadMore = useCallback(() => {
    if (!searchQuery.hasNextPage || searchQuery.isFetchingNextPage) return;
    void searchQuery.fetchNextPage();
  }, [
    searchQuery.fetchNextPage,
    searchQuery.hasNextPage,
    searchQuery.isFetchingNextPage,
  ]);
  const loadMoreRef = useInfiniteScrollSentinel({
    enabled: Boolean(
      searchQuery.hasNextPage && !searchQuery.isFetchingNextPage,
    ),
    onLoadMore: handleLoadMore,
  });
  // 用 async extractErrorMessage 拉响应 body 里的 `error` 字段（比裸 message
  // 信息量大得多）。结果存 state 里，error 变化时刷新。
  const [errMsg, setErrMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!searchQuery.error) {
      setErrMsg(null);
      return;
    }
    let cancelled = false;
    extractErrorMessage(searchQuery.error).then((msg) => {
      if (!cancelled) setErrMsg(msg);
    });
    return () => {
      cancelled = true;
    };
  }, [searchQuery.error]);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <h1 className="text-xl font-semibold text-zinc-100">🔍 搜索邮件</h1>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <input
            type="search"
            enterKeyHint="search"
            placeholder="搜索关键词…"
            maxLength={200}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className={`flex-1 min-w-0 text-[15px] ${INPUT_CLASS}`}
          />
          <button
            type="submit"
            disabled={
              searchQuery.isFetching || !buildGmailSearchQuery(input, advanced)
            }
            className="px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-sm font-semibold transition-[colors,transform] duration-100 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center min-w-17"
          >
            {searchQuery.isFetching ? <Spinner size="sm" /> : "搜索"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          {advancedOpen ? "收起高级搜索" : "高级搜索"}
        </button>

        {advancedOpen && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-zinc-400">
                发件人
                <input
                  type="text"
                  value={advanced.from}
                  onChange={(e) =>
                    setAdvanced((current) => ({
                      ...current,
                      from: e.target.value,
                    }))
                  }
                  placeholder="from@example.com"
                  className={`w-full text-sm ${INPUT_CLASS}`}
                />
              </label>
              <label className="space-y-1 text-xs text-zinc-400">
                收件人
                <input
                  type="text"
                  value={advanced.to}
                  onChange={(e) =>
                    setAdvanced((current) => ({
                      ...current,
                      to: e.target.value,
                    }))
                  }
                  placeholder="to@example.com"
                  className={`w-full text-sm ${INPUT_CLASS}`}
                />
              </label>
              <label className="space-y-1 text-xs text-zinc-400">
                主题
                <input
                  type="text"
                  value={advanced.subject}
                  onChange={(e) =>
                    setAdvanced((current) => ({
                      ...current,
                      subject: e.target.value,
                    }))
                  }
                  placeholder="邮件主题"
                  className={`w-full text-sm ${INPUT_CLASS}`}
                />
              </label>
              <label className="space-y-1 text-xs text-zinc-400">
                所在位置
                <select
                  value={advanced.location}
                  onChange={(e) =>
                    setAdvanced((current) => ({
                      ...current,
                      location: e.target
                        .value as AdvancedSearchFields["location"],
                    }))
                  }
                  className={`w-full text-sm ${INPUT_CLASS}`}
                >
                  <option value="">所有位置</option>
                  <option value="inbox">收件箱</option>
                  <option value="spam">垃圾邮件</option>
                  <option value="trash">回收站</option>
                  <option value="archive">归档</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-zinc-400">
                晚于
                <input
                  type="date"
                  value={advanced.after}
                  onChange={(e) =>
                    setAdvanced((current) => ({
                      ...current,
                      after: e.target.value,
                    }))
                  }
                  className={`w-full min-w-0 text-sm ${INPUT_CLASS}`}
                />
              </label>
              <label className="space-y-1 text-xs text-zinc-400">
                早于
                <input
                  type="date"
                  value={advanced.before}
                  onChange={(e) =>
                    setAdvanced((current) => ({
                      ...current,
                      before: e.target.value,
                    }))
                  }
                  className={`w-full min-w-0 text-sm ${INPUT_CLASS}`}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-300">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={advanced.hasAttachment}
                  onChange={(e) =>
                    setAdvanced((current) => ({
                      ...current,
                      hasAttachment: e.target.checked,
                    }))
                  }
                />
                有附件
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={advanced.isUnread}
                  onChange={(e) =>
                    setAdvanced((current) => ({
                      ...current,
                      isUnread: e.target.checked,
                    }))
                  }
                />
                未读
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={advanced.isStarred}
                  onChange={(e) =>
                    setAdvanced((current) => ({
                      ...current,
                      isStarred: e.target.checked,
                    }))
                  }
                />
                已加星标
              </label>
            </div>
            <p className="text-xs text-zinc-500">
              条件会组合成 Gmail 搜索语法，MCP 和 Agent 也可以直接传入同样的
              query。
            </p>
          </div>
        )}
      </form>

      <div
        className={`text-[13px] min-h-4.5 ${
          errMsg ? "text-red-400" : "text-zinc-500"
        }`}
      >
        {errMsg ??
          (firstPage
            ? `已载入 ${items.length} 封匹配 “${firstPage.query}”`
            : "默认按关键词搜索，也可以打开高级搜索")}
      </div>

      {!q ? null : searchQuery.isLoading ? (
        <MailListSkeleton />
      ) : !firstPage ? null : items.length === 0 &&
        accountErrors.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-10 text-center text-sm text-zinc-500">
          无匹配邮件
        </div>
      ) : (
        <>
          <MailListFlat
            items={items}
            errors={accountErrors}
            errorLabel={(r) => `搜索失败：${r.error}`}
          >
            {(it) => (
              <button
                type="button"
                onClick={() => navigateToMail(it.accountId, it.id, it.token)}
                className="block w-full text-left px-4 py-3 hover:bg-zinc-800/60 active:bg-zinc-800 transition-colors"
              >
                <div className="text-sm text-emerald-300 wrap-break-word">
                  {it.title || "(无主题)"}
                </div>
                <MailListAddressMeta item={it} />
              </button>
            )}
          </MailListFlat>
          <div
            ref={loadMoreRef}
            className="min-h-10 flex items-center justify-center"
          >
            {searchQuery.isFetchingNextPage ? (
              <Spinner size="sm" />
            ) : searchQuery.hasNextPage ? (
              <span className="text-xs text-zinc-600">继续加载</span>
            ) : (
              <span className="text-xs text-zinc-700">已全部载入</span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const EMPTY_ADVANCED_SEARCH: AdvancedSearchFields = {
  from: "",
  to: "",
  subject: "",
  after: "",
  before: "",
  location: "",
  hasAttachment: false,
  isUnread: false,
  isStarred: false,
};

const buildGmailSearchQuery = (
  keyword: string,
  fields: AdvancedSearchFields,
): string => {
  const terms = [keyword.trim()];
  addGmailField(terms, "from", fields.from);
  addGmailField(terms, "to", fields.to);
  addGmailField(terms, "subject", fields.subject);
  addGmailField(terms, "after", fields.after.replaceAll("-", "/"));
  addGmailField(terms, "before", fields.before.replaceAll("-", "/"));
  if (fields.location) terms.push(`in:${fields.location}`);
  if (fields.hasAttachment) terms.push("has:attachment");
  if (fields.isUnread) terms.push("is:unread");
  if (fields.isStarred) terms.push("is:starred");
  return terms.filter(Boolean).join(" ");
};

const addGmailField = (terms: string[], field: string, value: string): void => {
  const trimmed = value.trim();
  if (!trimmed) return;
  terms.push(`${field}:${formatGmailValue(trimmed)}`);
};

const formatGmailValue = (value: string): string => {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return /\s/.test(value) ? `"${escaped}"` : escaped;
};

const Search = t.Object({ q: t.Optional(t.String()) });

export const Route = createFileRoute("/telegram-app/search")({
  component: SearchPage,
  validateSearch: validateSearch(Search),
});
