import { Spinner } from "@heroui/react";
import { api } from "@page/api/client";
import { extractErrorMessage } from "@page/api/utils";
import { useBackButton } from "@page/hooks/use-back-button";
import { notifyHaptic, openExternalLink } from "@page/utils/tg";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type {
  CreateImapAccountBody,
  CreateOAuthAccountBody,
} from "@worker/api/modules/accounts/model";
import { useState } from "react";
import { AddAccountPanel } from "./-components/add-account-panel";
import { ErrorBox } from "./-components/error-box";
import {
  unwrapAccountList,
  unwrapMutationResponse,
  unwrapOAuthResponse,
} from "./-utils/api";

const AddAccountPage = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<{
    msg: string;
    kind: "ok" | "error";
  } | null>(null);

  useBackButton("/telegram-app/accounts");

  const metaQuery = useQuery({
    queryKey: ["accounts", "add-meta"],
    queryFn: async () => {
      const { data, error } = await api.api.accounts.get({
        query: { scope: "own" },
      });
      if (error) throw error;
      return unwrapAccountList(data);
    },
  });

  const handleError = async (err: unknown) => {
    setStatus({ msg: await extractErrorMessage(err), kind: "error" });
    notifyHaptic("error");
  };

  const createOAuthMut = useMutation({
    mutationFn: async (body: CreateOAuthAccountBody) => {
      const { data, error } = await api.api.accounts.oauth.post(body);
      if (error) throw error;
      return unwrapOAuthResponse(data);
    },
    onSuccess: (data) => {
      setStatus({ msg: "账号已创建，正在打开授权页", kind: "ok" });
      notifyHaptic("success");
      openExternalLink(data.oauthUrl);
      navigate({
        to: "/telegram-app/accounts/$id",
        params: { id: String(data.account.id) },
      });
    },
    onError: handleError,
  });

  const createImapMut = useMutation({
    mutationFn: async (body: CreateImapAccountBody) => {
      const { data, error } = await api.api.accounts.imap.post(body);
      if (error) throw error;
      return unwrapMutationResponse(data);
    },
    onSuccess: (data) => {
      setStatus({ msg: "IMAP 账号已添加", kind: "ok" });
      notifyHaptic("success");
      navigate({
        to: "/telegram-app/accounts/$id",
        params: { id: String(data.account.id) },
      });
    },
    onError: handleError,
  });

  const busy = createOAuthMut.isPending || createImapMut.isPending;

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-zinc-100">添加账号</h1>
        <p className="text-xs text-zinc-500">选择邮箱类型并完成必要配置。</p>
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

      {metaQuery.isLoading ? (
        <div className="flex min-h-48 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
          <Spinner size="lg" color="success" />
        </div>
      ) : metaQuery.isError || !metaQuery.data ? (
        <ErrorBox error={metaQuery.error} fallback="账号信息加载失败" />
      ) : (
        <AddAccountPanel
          providers={metaQuery.data.providers}
          currentUserId={metaQuery.data.currentUserId}
          busy={busy}
          onCreateOAuth={(body) => createOAuthMut.mutate(body)}
          onCreateImap={(body) => createImapMut.mutate(body)}
        />
      )}
    </div>
  );
};

export const Route = createFileRoute("/telegram-app/accounts/add")({
  component: AddAccountPage,
});
