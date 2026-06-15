import type { EmailListItem } from "@worker/providers/types";
import { formatAddress } from "@worker/utils/mail/body";
import PostalMime from "postal-mime";

export interface DatedEmailListItem extends EmailListItem {
  date?: string;
}

export const buildMessagesFromHeaders = async (
  blocks: { header: ArrayBuffer }[],
): Promise<DatedEmailListItem[]> => {
  const messages: DatedEmailListItem[] = [];
  for (const block of blocks) {
    const parsed = await new PostalMime().parse(block.header);
    if (!parsed.messageId) continue;
    messages.push({
      id: parsed.messageId,
      subject: parsed.subject ?? undefined,
      from: parsed.from ? formatAddress(parsed.from) : undefined,
      to: parsed.to?.map(formatAddress).join(", ") || undefined,
      date: parsed.date ? new Date(parsed.date).toISOString() : undefined,
    });
  }
  return messages;
};

export const sortByDateDesc = <T extends { date?: string }>(
  items: T[],
): T[] => {
  return items.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
};
