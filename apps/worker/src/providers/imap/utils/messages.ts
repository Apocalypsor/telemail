import type { EmailListItem } from "@worker/providers/types";
import { sortEmailListItemsByDateDesc } from "@worker/providers/utils";
import { formatAddress } from "@worker/utils/mail/body";
import PostalMime from "postal-mime";

export type DatedEmailListItem = EmailListItem;

export const buildMessagesFromHeaders = async (
  blocks: { header: ArrayBuffer }[],
): Promise<EmailListItem[]> => {
  const messages: EmailListItem[] = [];
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

export const sortByDateDesc = <T extends { date?: string }>(items: T[]): T[] =>
  sortEmailListItemsByDateDesc(items);
