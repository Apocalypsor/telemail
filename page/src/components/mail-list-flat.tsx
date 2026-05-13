import type { FlatMailListItem } from "@page/utils/mail-list-pagination";
import type { MailListAccountResult } from "@worker/api/modules/miniapp/model";
import type { ReactNode } from "react";

export const accountMailLabel = (item: {
  accountId: number;
  accountEmail: string | null;
}): string => item.accountEmail || `Account #${item.accountId}`;

export const MailListFlat = ({
  items,
  errors,
  errorLabel,
  children,
}: {
  items: FlatMailListItem[];
  errors?: MailListAccountResult[];
  errorLabel: (result: MailListAccountResult) => string;
  children: (item: FlatMailListItem, accountLabel: string) => ReactNode;
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
          <li key={`${item.accountId}:${item.id}`}>
            {children(item, accountMailLabel(item))}
          </li>
        ))}
      </ul>
    </div>
  );
};
