import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  MailListResult,
  MailSearchResult,
} from "@worker/api/modules/miniapp/types";
import { getOwnAccounts } from "@worker/db/accounts";
import type { Account, Env } from "@worker/types";
import { htmlToMarkdown } from "@worker/utils/mail/body";
import type { McpToolCallback, McpToolConfig } from "./types";

export const mcpJsonResult = (data: unknown): CallToolResult => {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
};

export const mcpErrorResult = (message: string): CallToolResult => {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
};

export const getOwnActiveAccount = async (
  env: Env,
  userId: string,
  accountId: number,
): Promise<Account | null> => {
  const accounts = await getOwnAccounts(env.DB, userId);
  return (
    accounts.find((account) => account.id === accountId && !account.disabled) ??
    null
  );
};

export const registerMcpTool = <TInput>(
  server: McpServer,
  name: string,
  config: McpToolConfig,
  callback: McpToolCallback<TInput>,
): void => {
  const register = server.registerTool as (
    name: string,
    config: McpToolConfig,
    callback: McpToolCallback<TInput>,
  ) => void;
  register.call(server, name, config, callback);
};

export const safeHtmlToMarkdown = (html: string): string => {
  try {
    return htmlToMarkdown(html);
  } catch {
    return html.replace(/<[^>]*>/g, "").trim();
  }
};

export const toMcpMailListResult = (result: MailListResult) => {
  return {
    type: result.type,
    total: result.total,
    results: result.results.map((accountResult) => ({
      accountId: accountResult.accountId,
      accountEmail: accountResult.accountEmail,
      total: accountResult.total,
      nextCursor: accountResult.nextCursor,
      error: accountResult.error,
      items: accountResult.items.map((item) => ({
        id: item.id,
        title: item.title,
        from: item.from,
        to: item.to,
        tgChatId: item.tgChatId,
        tgMessageId: item.tgMessageId,
      })),
    })),
  };
};

export const toMcpMailSearchResult = (result: MailSearchResult) => {
  return {
    query: result.query,
    total: result.total,
    results: result.results.map((accountResult) => ({
      accountId: accountResult.accountId,
      accountEmail: accountResult.accountEmail,
      total: accountResult.total,
      nextCursor: accountResult.nextCursor,
      error: accountResult.error,
      items: accountResult.items.map((item) => ({
        id: item.id,
        title: item.title,
        from: item.from,
        to: item.to,
        tgChatId: item.tgChatId,
        tgMessageId: item.tgMessageId,
      })),
    })),
  };
};
