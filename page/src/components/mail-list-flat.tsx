import type { FlatMailListItem } from "@page/utils/mail-list-pagination";
import type { MailListAccountResult } from "@worker/api/modules/miniapp/model";
import type { ReactNode } from "react";

const formatEmailOnly = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const emails = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return emails && emails.length > 0 ? emails.join(", ") : value;
};

export const MailListAddressMeta = ({
  item,
}: {
  item: Pick<FlatMailListItem, "from" | "to">;
}) => {
  const to = formatEmailOnly(item.to);
  return (
    <div className="mt-1.5 space-y-0.5 text-[11px] leading-4 break-words">
      {item.from && <div className="min-w-0 text-zinc-100">{item.from}</div>}
      {to && <div className="min-w-0 text-zinc-500">{to}</div>}
    </div>
  );
};

export const MailListFlat = ({
  items,
  errors,
  errorLabel,
  children,
}: {
  items: FlatMailListItem[];
  errors?: MailListAccountResult[];
  errorLabel: (result: MailListAccountResult) => string;
  children: (item: FlatMailListItem) => ReactNode;
}) => {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      {errors && errors.length > 0 && (
        <div className="divide-y divide-red-900/40 border-b border-zinc-800 bg-red-950/20">
          {errors.map((result) => (
            <div
              key={result.accountId}
              className="px-4 py-3 text-sm text-red-300"
            >
              <span className="font-medium">
                {result.accountEmail || `Account #${result.accountId}`}
              </span>
              <span className="text-red-400"> · {errorLabel(result)}</span>
            </div>
          ))}
        </div>
      )}
      <ul className="divide-y divide-zinc-800">
        {items.map((item) => (
          <li key={`${item.accountId}:${item.id}`}>{children(item)}</li>
        ))}
      </ul>
    </div>
  );
};
