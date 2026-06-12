import { z } from "zod/v4";

const MailListTypeSchema = z.enum(["unread", "starred", "junk", "archived"]);
const LimitSchema = z.number().int().min(1).max(50).optional();
const FolderSchema = z.enum(["inbox", "junk", "archive"]).optional();

export const ListMailToolInputSchema = {
  type: MailListTypeSchema,
  limit: LimitSchema,
};

export const SearchMailToolInputSchema = {
  query: z.string().trim().min(1).max(200),
  limit: LimitSchema,
};

export const ReadMailToolInputSchema = {
  accountId: z.number().int().positive(),
  messageId: z.string().min(1),
  folder: FolderSchema,
};
