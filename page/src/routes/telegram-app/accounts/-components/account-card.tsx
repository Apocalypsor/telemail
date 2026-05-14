import { Spinner } from "@heroui/react";
import { api } from "@page/api/client";
import { extractErrorMessage } from "@page/api/utils";
import { INPUT_CLASS } from "@page/styles/inputs";
import { useQuery } from "@tanstack/react-query";
import type {
  AccountResponse,
  AccountUserOption,
} from "@worker/api/modules/accounts/model";
import { useEffect, useState } from "react";
import { unwrapArchiveLabels } from "../-utils/api";

interface AccountCardProps {
  account: AccountResponse;
  users: AccountUserOption[];
  busy?: boolean;
  onAuthorize: (accountId: number) => void;
  onRenewPush: (accountId: number) => void;
  onUpdateChatId: (accountId: number, chatId: string) => void;
  onToggleDisabled: (accountId: number, disabled: boolean) => void;
  onAssignOwner: (accountId: number, telegramUserId: string) => void;
  onDelete: (account: AccountResponse) => void;
  onSetArchiveLabel: (accountId: number, labelId: string | null) => void;
}

interface ArchivePickerProps {
  value: string;
  loading: boolean;
  error: unknown;
  labels: { id: string; name: string }[];
  busy?: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}

export const AccountCard = ({
  account,
  users,
  busy,
  onAuthorize,
  onRenewPush,
  onUpdateChatId,
  onToggleDisabled,
  onAssignOwner,
  onDelete,
  onSetArchiveLabel,
}: AccountCardProps) => {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatId, setChatId] = useState(account.chatId);
  const [ownerId, setOwnerId] = useState(account.ownerTelegramId ?? "");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveLabelId, setArchiveLabelId] = useState(
    account.archiveFolder ?? "",
  );

  useEffect(() => {
    setChatId(account.chatId);
    setOwnerId(account.ownerTelegramId ?? "");
    setArchiveLabelId(account.archiveFolder ?? "");
  }, [account]);

  const labelsQuery = useQuery({
    queryKey: ["account-archive-labels", account.id],
    enabled: archiveOpen && account.needsArchiveSetup && account.authorized,
    queryFn: async () => {
      const { data, error } = await api.api
        .accounts({ id: String(account.id) })
        ["archive-labels"].get();
      if (error) throw error;
      return unwrapArchiveLabels(data).labels;
    },
  });

  const archiveLabel =
    account.archiveFolderName || account.archiveFolder || "未设置";
  const title = account.email || `#${account.id}`;

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <header className="border-b border-zinc-800 bg-zinc-950/30 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-100 break-words">
                {title}
              </h2>
              <StatusPill active={!account.disabled}>
                {account.disabled ? "已禁用" : "启用中"}
              </StatusPill>
              {account.oauth && (
                <StatusPill active={account.authorized}>
                  {account.authorized ? "已授权" : "未授权"}
                </StatusPill>
              )}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              #{account.id} · {account.typeName}
            </div>
          </div>
          {busy && <Spinner size="sm" color="success" />}
        </div>
      </header>

      <div className="p-4 space-y-4">
        <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-sm">
          <Meta label="Chat ID" value={account.chatId} />
          {account.ownerTelegramId && (
            <Meta
              label="Owner"
              value={account.ownerName || account.ownerTelegramId}
            />
          )}
          {account.imapHost && (
            <Meta
              label="Server"
              value={`${account.imapHost}:${account.imapPort ?? ""}${
                account.imapSecure ? " TLS" : ""
              }`}
            />
          )}
          {account.imapUser && <Meta label="User" value={account.imapUser} />}
          {account.needsArchiveSetup && (
            <Meta label="Archive" value={archiveLabel} />
          )}
        </dl>

        <div className="grid grid-cols-2 gap-2">
          {account.oauth && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAuthorize(account.id)}
              className="min-h-10 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-sm font-semibold text-emerald-300 active:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {account.authorized ? "重新授权" : "授权"}
            </button>
          )}
          {account.oauth && account.authorized && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRenewPush(account.id)}
              className="min-h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm font-semibold text-zinc-300 active:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              续订 Watch
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onToggleDisabled(account.id, !account.disabled)}
            className="min-h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm font-semibold text-zinc-300 active:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {account.disabled ? "启用" : "禁用"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(account)}
            className="min-h-10 rounded-lg border border-red-900/60 bg-red-950/35 px-3 text-sm font-semibold text-red-300 active:bg-red-950/60 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            删除
          </button>
        </div>

        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setChatOpen((value) => !value)}
            className="text-sm font-semibold text-zinc-300 active:text-emerald-300"
          >
            {chatOpen ? "收起 Chat ID" : "编辑 Chat ID"}
          </button>
          {chatOpen && (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                value={chatId}
                inputMode="numeric"
                onChange={(event) => setChatId(event.target.value)}
                className={`min-w-0 text-[15px] ${INPUT_CLASS}`}
              />
              <button
                type="button"
                disabled={busy || chatId.trim() === account.chatId}
                onClick={() => onUpdateChatId(account.id, chatId)}
                className="min-w-[64px] rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-emerald-950 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                保存
              </button>
            </div>
          )}
        </section>

        {users.length > 0 && (
          <section className="space-y-2">
            <span className="block text-sm font-semibold text-zinc-300">
              所有者
            </span>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
                className={`min-w-0 text-[15px] ${INPUT_CLASS}`}
              >
                <option value="" disabled>
                  选择用户
                </option>
                {users.map((user) => (
                  <option key={user.telegramId} value={user.telegramId}>
                    {user.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={
                  busy || !ownerId || ownerId === account.ownerTelegramId
                }
                onClick={() => onAssignOwner(account.id, ownerId)}
                className="min-w-[64px] rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-emerald-950 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                保存
              </button>
            </div>
          </section>
        )}

        {account.needsArchiveSetup && account.authorized && (
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setArchiveOpen((value) => !value)}
              className="text-sm font-semibold text-zinc-300 active:text-emerald-300"
            >
              {archiveOpen ? "收起归档标签" : "设置归档标签"}
            </button>
            {archiveOpen && (
              <ArchivePicker
                value={archiveLabelId}
                loading={labelsQuery.isLoading}
                error={labelsQuery.error}
                labels={labelsQuery.data ?? []}
                busy={busy}
                onChange={setArchiveLabelId}
                onSave={() =>
                  onSetArchiveLabel(account.id, archiveLabelId || null)
                }
              />
            )}
          </section>
        )}
      </div>
    </article>
  );
};

const Meta = ({ label, value }: { label: string; value: string }) => (
  <>
    <dt className="text-zinc-500">{label}</dt>
    <dd className="min-w-0 text-zinc-300 break-words">{value}</dd>
  </>
);

const StatusPill = ({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) => (
  <span
    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
      active
        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
        : "border-zinc-800 bg-zinc-950 text-zinc-500"
    }`}
  >
    {children}
  </span>
);

const ArchivePicker = ({
  value,
  loading,
  error,
  labels,
  busy,
  onChange,
  onSave,
}: ArchivePickerProps) => {
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!error) {
      setErrorText(null);
      return;
    }
    let cancelled = false;
    extractErrorMessage(error).then((message) => {
      if (!cancelled) setErrorText(message);
    });
    return () => {
      cancelled = true;
    };
  }, [error]);

  if (loading) {
    return (
      <div className="flex min-h-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950">
        <Spinner size="sm" />
      </div>
    );
  }

  if (errorText) {
    return (
      <div className="rounded-lg border border-red-900/60 bg-red-950/35 px-3 py-2 text-sm text-red-300">
        {errorText}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`min-w-0 text-[15px] ${INPUT_CLASS}`}
      >
        <option value="">不归档</option>
        {labels.map((label) => (
          <option key={label.id} value={label.id}>
            {label.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy}
        onClick={onSave}
        className="min-w-[64px] rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-emerald-950 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        保存
      </button>
    </div>
  );
};
