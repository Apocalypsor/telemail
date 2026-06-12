import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MailService } from "@worker/api/modules/mail/service";
import { MiniappService } from "@worker/api/modules/miniapp/service";
import { getOwnAccounts } from "@worker/db/accounts";
import { accountCanArchive } from "@worker/providers";
import type { Env } from "@worker/types";
import { buildWebMailUrl } from "@worker/utils/mail/token";
import { getWorkerBaseUrl } from "@worker/utils/url";
import {
  ListMailToolInputSchema,
  ReadMailToolInputSchema,
  SearchMailToolInputSchema,
} from "./model";
import type {
  ListMailToolInput,
  ReadMailToolInput,
  SearchMailToolInput,
} from "./types";
import {
  getOwnActiveAccount,
  mcpErrorResult,
  mcpJsonResult,
  registerMcpTool,
  safeHtmlToMarkdown,
  toMcpMailListResult,
  toMcpMailSearchResult,
} from "./utils";

export abstract class McpService {
  static createServer(env: Env, userId: string): McpServer {
    const server = new McpServer({
      name: "telemail",
      version: "0.1.0",
    });

    server.registerTool(
      "list_accounts",
      {
        title: "List email accounts",
        description:
          "List the current user's Telemail email accounts. Disabled accounts are returned but skipped by mail list/search tools.",
      },
      async () => {
        const accounts = await getOwnAccounts(env.DB, userId);
        return mcpJsonResult({
          accounts: accounts.map((account) => ({
            id: account.id,
            type: account.type,
            email: account.email,
            disabled: account.disabled === 1,
          })),
        });
      },
    );

    registerMcpTool<ListMailToolInput>(
      server,
      "list_mail",
      {
        title: "List mail",
        description:
          "List unread, starred, junk, or archived mail across the current user's enabled accounts.",
        inputSchema: ListMailToolInputSchema,
      },
      async ({ type, limit }) => {
        const result = await MiniappService.getMailList(env, userId, type, {
          limit,
        });
        return mcpJsonResult(toMcpMailListResult(result));
      },
    );

    registerMcpTool<SearchMailToolInput>(
      server,
      "search_mail",
      {
        title: "Search mail",
        description:
          "Search mail across the current user's enabled accounts. Use provider-native search syntax where supported.",
        inputSchema: SearchMailToolInputSchema,
      },
      async ({ query, limit }) => {
        const result = await MiniappService.searchMail(env, userId, query, {
          limit,
        });
        return mcpJsonResult(toMcpMailSearchResult(result));
      },
    );

    registerMcpTool<ReadMailToolInput>(
      server,
      "read_mail",
      {
        title: "Read mail",
        description:
          "Read one message from one of the current user's enabled accounts. Get accountId and messageId from list_mail or search_mail.",
        inputSchema: ReadMailToolInputSchema,
      },
      async ({ accountId, messageId, folder }) => {
        const account = await getOwnActiveAccount(env, userId, accountId);
        if (!account) return mcpErrorResult("Account not found");

        const result = await MailService.loadForRendering(
          env,
          account,
          messageId,
          folder,
        );
        if (!result.ok) return mcpErrorResult(result.reason);

        const token = await MailService.generateToken(
          env.ADMIN_SECRET,
          messageId,
          account.id,
        );
        return mcpJsonResult({
          account: {
            id: account.id,
            type: account.type,
            email: account.email,
          },
          meta: result.meta,
          folder: result.fetchFolder,
          inJunk: result.inJunk,
          inArchive: result.fetchFolder === "archive",
          starred: result.starred,
          canArchive: accountCanArchive(account),
          attachments: result.attachments,
          bodyText: safeHtmlToMarkdown(result.rawHtml),
          webMailUrl: buildWebMailUrl(
            getWorkerBaseUrl(env),
            messageId,
            account.id,
            token,
            result.fetchFolder !== "inbox" ? result.fetchFolder : undefined,
          ),
        });
      },
    );

    return server;
  }
}
