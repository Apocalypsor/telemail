import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { z } from "zod/v4";

type McpInputSchema<TSchema extends z.ZodType> = TSchema & AnySchema;

const MCP_MAIL_LIST_TYPES = ["unread", "starred", "junk", "archived"] as const;
const MCP_FOLDERS = ["inbox", "junk", "archive"] as const;

const MailListTypeSchema = z.enum(MCP_MAIL_LIST_TYPES);
const LimitSchema = z.int().min(1).max(50).optional();
const FolderSchema = z.enum(MCP_FOLDERS).optional();

// MCP SDK types accept zod/v4/core schemas; keep the compatibility assertion
// at the schema boundary while deriving app input types from the original schema.
const asMcpInputSchema = <TSchema extends z.ZodType>(
  schema: TSchema,
): McpInputSchema<TSchema> => schema as McpInputSchema<TSchema>;

const ListMailToolInputObjectSchema = z.object({
  type: MailListTypeSchema,
  limit: LimitSchema,
});
export const ListMailToolInputSchema = asMcpInputSchema(
  ListMailToolInputObjectSchema,
);
export type ListMailToolInput = z.infer<typeof ListMailToolInputObjectSchema>;

const SearchMailToolInputObjectSchema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: LimitSchema,
});
export const SearchMailToolInputSchema = asMcpInputSchema(
  SearchMailToolInputObjectSchema,
);
export type SearchMailToolInput = z.infer<
  typeof SearchMailToolInputObjectSchema
>;

const ReadMailToolInputObjectSchema = z.object({
  accountId: z.int().positive(),
  messageId: z.string().min(1),
  folder: FolderSchema,
});
export const ReadMailToolInputSchema = asMcpInputSchema(
  ReadMailToolInputObjectSchema,
);
export type ReadMailToolInput = z.infer<typeof ReadMailToolInputObjectSchema>;
