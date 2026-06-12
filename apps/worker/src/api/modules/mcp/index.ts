import { cf } from "@worker/api/plugins/cf";
import { mcpAuth } from "@worker/api/plugins/mcp-auth";
import { createMcpHandler } from "agents/mcp";
import { Elysia } from "elysia";
import { McpService } from "./service";

export const mcpController = new Elysia({ name: "controller.mcp" })
  .use(cf)
  .use(mcpAuth)
  .all(
    "/api/mcp",
    async ({ env, executionCtx, request, mcpUserId }) => {
      const server = McpService.createServer(env, mcpUserId);
      return createMcpHandler(server, { route: "/api/mcp" })(
        request,
        env,
        executionCtx,
      );
    },
    { parse: "none" },
  );
