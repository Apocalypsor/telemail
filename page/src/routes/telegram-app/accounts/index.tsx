import { Spinner } from "@heroui/react";
import { api } from "@page/api/client";
import { useBackButton } from "@page/hooks/use-back-button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorBox } from "./-components/error-box";
import { ACCOUNTS_QUERY_KEY, unwrapAccountList } from "./-utils/api";

const AccountsPage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [scope, setScope] = useState<"own" | "all">("own");

  useBackButton(undefined);

  const accountsQuery = useQuery({
    queryKey: ACCOUNTS_QUERY_KEY(scope),
    queryFn: async () => {
      const { data, error } = await api.api.accounts.get({ query: { scope } });
      if (error) throw error;
      return unwrapAccountList(data);
    },
  });

  const invalidateAccounts = () =>
    qc.invalidateQueries({ queryKey: ["accounts"] });
  const data = accountsQuery.data;

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-zinc-100">账号管理</h1>
          <p className="mt-1 text-xs text-zinc-500">
            {data ? `${data.accounts.length} 个账号` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/telegram-app/accounts/add" })}
          className="shrink-0 min-h-10 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-emerald-950 active:bg-emerald-400"
        >
          添加账号
        </button>
      </header>

      <div className="flex items-center justify-between gap-3">
        {data?.canViewAll ? (
          <div className="grid grid-cols-2 rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
            {(["own", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setScope(value)}
                className={`min-h-8 rounded-md px-3 text-xs font-semibold ${
                  scope === value
                    ? "bg-emerald-500 text-emerald-950"
                    : "text-zinc-500 active:text-zinc-200"
                }`}
              >
                {value === "own" ? "我的" : "全部"}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-xs text-zinc-600">邮箱列表</span>
        )}
        <button
          type="button"
          onClick={() => invalidateAccounts()}
          aria-label="刷新账号"
          className={`size-9 rounded-full border border-zinc-800 bg-zinc-950 text-zinc-300 active:bg-zinc-800 ${
            accountsQuery.isFetching ? "animate-spin" : ""
          }`}
        >
          ↻
        </button>
      </div>

      {accountsQuery.isLoading ? (
        <div className="flex min-h-48 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
          <Spinner size="lg" color="success" />
        </div>
      ) : accountsQuery.isError || !data ? (
        <ErrorBox error={accountsQuery.error} fallback="账号加载失败" />
      ) : data.accounts.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-10 text-center text-sm text-zinc-500">
          暂无账号
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          {data.accounts.map((account, index) => (
            <button
              key={account.id}
              type="button"
              onClick={() =>
                navigate({
                  to: "/telegram-app/accounts/$id",
                  params: { id: String(account.id) },
                })
              }
              className={`block w-full px-4 py-3.5 text-left text-[15px] font-medium text-zinc-100 active:bg-zinc-800 ${
                index > 0 ? "border-t border-zinc-800" : ""
              }`}
            >
              <span className="block truncate">
                {account.email || `#${account.id}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const Route = createFileRoute("/telegram-app/accounts/")({
  component: AccountsPage,
});
