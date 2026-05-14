import { Spinner } from "@heroui/react";
import { INPUT_CLASS } from "@page/styles/inputs";
import type {
  AccountProviderOption,
  CreateImapAccountBody,
  CreateOAuthAccountBody,
} from "@worker/api/modules/accounts/model";
import { useEffect, useMemo, useState } from "react";
import { isOAuthAccountType } from "../-utils/state";

interface AddAccountPanelProps {
  providers: AccountProviderOption[];
  currentUserId: string;
  busy?: boolean;
  onCreateOAuth: (body: CreateOAuthAccountBody) => void;
  onCreateImap: (body: CreateImapAccountBody) => void;
}

export const AddAccountPanel = ({
  providers,
  currentUserId,
  busy,
  onCreateOAuth,
  onCreateImap,
}: AddAccountPanelProps) => {
  const [type, setType] = useState<AccountProviderOption["type"]>("gmail");
  const [chatId, setChatId] = useState(currentUserId);
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [imapSecure, setImapSecure] = useState(true);
  const [imapUser, setImapUser] = useState("");
  const [imapPass, setImapPass] = useState("");

  useEffect(() => {
    setChatId((value) => value || currentUserId);
  }, [currentUserId]);

  const selected = useMemo(
    () => providers.find((provider) => provider.type === type) ?? providers[0],
    [providers, type],
  );
  const isImap = selected?.type === "imap";
  const canSubmit =
    !!selected?.configured &&
    chatId.trim().length > 0 &&
    (!isImap ||
      (imapHost.trim() &&
        imapPort.trim() &&
        imapUser.trim() &&
        imapPass.trim()));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !canSubmit || busy) return;
    if (selected.oauth && isOAuthAccountType(selected.type)) {
      onCreateOAuth({ type: selected.type, chatId: chatId.trim() });
      return;
    }
    onCreateImap({
      chatId: chatId.trim(),
      imapHost: imapHost.trim(),
      imapPort: Number(imapPort),
      imapSecure,
      imapUser: imapUser.trim(),
      imapPass,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5 space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-100">添加账号</h2>
        {busy && <Spinner size="sm" color="success" />}
      </div>

      <fieldset className="grid grid-cols-3 gap-2">
        <legend className="sr-only">账号类型</legend>
        {providers.map((provider) => (
          <button
            key={provider.type}
            type="button"
            disabled={!provider.configured || busy}
            onClick={() => setType(provider.type)}
            className={`min-h-10 rounded-lg border px-2 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              provider.type === selected?.type
                ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                : "border-zinc-800 bg-zinc-950 text-zinc-400 active:bg-zinc-800"
            }`}
          >
            {provider.displayName}
          </button>
        ))}
      </fieldset>

      <label className="block">
        <span className="block text-xs font-medium tracking-wide text-zinc-400 uppercase mb-2">
          Chat ID
        </span>
        <input
          value={chatId}
          inputMode="numeric"
          onChange={(event) => setChatId(event.target.value)}
          className={`w-full text-[15px] ${INPUT_CLASS}`}
        />
      </label>

      {isImap && (
        <div className="grid gap-3">
          <label className="block">
            <span className="block text-xs font-medium tracking-wide text-zinc-400 uppercase mb-2">
              IMAP 服务器
            </span>
            <input
              value={imapHost}
              placeholder="imap.example.com"
              onChange={(event) => setImapHost(event.target.value)}
              className={`w-full text-[15px] ${INPUT_CLASS}`}
            />
          </label>

          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <label className="block min-w-0">
              <span className="block text-xs font-medium tracking-wide text-zinc-400 uppercase mb-2">
                端口
              </span>
              <input
                value={imapPort}
                inputMode="numeric"
                onChange={(event) => setImapPort(event.target.value)}
                className={`w-full text-[15px] ${INPUT_CLASS}`}
              />
            </label>
            <label className="h-11 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm font-medium text-zinc-300">
              <input
                type="checkbox"
                checked={imapSecure}
                onChange={(event) => setImapSecure(event.target.checked)}
                className="size-4 accent-emerald-500"
              />
              TLS
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-medium tracking-wide text-zinc-400 uppercase mb-2">
              用户名
            </span>
            <input
              value={imapUser}
              autoComplete="username"
              onChange={(event) => setImapUser(event.target.value)}
              className={`w-full text-[15px] ${INPUT_CLASS}`}
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium tracking-wide text-zinc-400 uppercase mb-2">
              密码
            </span>
            <input
              type="password"
              value={imapPass}
              autoComplete="current-password"
              onChange={(event) => setImapPass(event.target.value)}
              className={`w-full text-[15px] ${INPUT_CLASS}`}
            />
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit || busy}
        className="w-full min-h-11 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition-[colors,transform] duration-100 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        {selected?.oauth ? "创建并授权" : "添加 IMAP"}
      </button>
    </form>
  );
};
