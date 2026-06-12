import { getUserByMcpApiKeyHash } from "@worker/db/users";
import { extractBearerApiKey, hashMcpApiKey } from "@worker/utils/mcp-api-key";
import { Elysia } from "elysia";
import { cf } from "./cf";

export const mcpAuth = new Elysia({ name: "mcp-auth" })
  .use(cf)
  .derive({ as: "scoped" }, async ({ env, headers, set, status }) => {
    const apiKey = extractBearerApiKey(headers.authorization ?? null);
    if (!apiKey) {
      set.headers["WWW-Authenticate"] = 'Bearer realm="telemail-mcp"';
      return status(401, { error: "Unauthorized" });
    }

    const user = await getUserByMcpApiKeyHash(
      env.DB,
      await hashMcpApiKey(env.ADMIN_SECRET, apiKey),
    );
    const isAdmin = user?.telegram_id === env.ADMIN_TELEGRAM_ID;
    if (!user || (!isAdmin && user.approved !== 1)) {
      set.headers["WWW-Authenticate"] = 'Bearer realm="telemail-mcp"';
      return status(401, { error: "Unauthorized" });
    }

    return { mcpUserId: user.telegram_id };
  });
