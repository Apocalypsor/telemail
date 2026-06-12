import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type McpFolder = "inbox" | "junk" | "archive";
export type McpMailListType = "unread" | "starred" | "junk" | "archived";

export interface ListMailToolInput {
  type: McpMailListType;
  limit?: number;
}

export interface SearchMailToolInput {
  query: string;
  limit?: number;
}

export interface ReadMailToolInput {
  accountId: number;
  messageId: string;
  folder?: McpFolder;
}

export interface McpToolConfig {
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type McpToolCallback<TInput> = (
  input: TInput,
) => CallToolResult | Promise<CallToolResult>;
