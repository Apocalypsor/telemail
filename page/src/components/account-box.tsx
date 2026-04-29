/**
 * Mini App 列表 / 搜索页用的"按账号分组"卡片：顶部一条 zinc-950/30 的 header
 * 显示账号名 + 可选 count chip / 错误态色彩，body 由 children 决定。
 */
export function AccountBox({
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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
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
