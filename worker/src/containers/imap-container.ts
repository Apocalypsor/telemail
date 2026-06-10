import { env as cfEnv } from "cloudflare:workers";
import { Container } from "@cloudflare/containers";
import {
  isImapBridgePushBody,
  toImapBridgeAccount,
} from "@worker/api/modules/providers/utils";
import { getImapAccounts } from "@worker/db/accounts";
import { ImapProvider } from "@worker/providers/imap";
import type { Env } from "@worker/types";
import { timingSafeEqual } from "@worker/utils/hash";
import { reportErrorToObservability } from "@worker/utils/observability";

export const IMAP_BRIDGE_CONTAINER_NAME = "imap-bridge";
export const IMAP_BRIDGE_CONTAINER_ORIGIN = "http://imap-bridge.container";

const TELEMAIL_WORKER_INTERNAL_HOST = "telemail.worker";
const TELEMAIL_WORKER_INTERNAL_ORIGIN = `http://${TELEMAIL_WORKER_INTERNAL_HOST}`;

const workerEnv = cfEnv as unknown as Env;

export class ImapBridgeContainer extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = "2h";
  envVars = getContainerEnvVars();

  override onError(error: unknown): unknown {
    this.ctx.waitUntil(
      reportErrorToObservability(
        this.env,
        "imap_bridge_container.error",
        error,
      ),
    );
    return error;
  }
}

ImapBridgeContainer.outboundByHost = {
  [TELEMAIL_WORKER_INTERNAL_HOST]: async (request, env) =>
    handleInternalWorkerRequest(request, env as unknown as Env),
};

const handleInternalWorkerRequest = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  if (!isAuthorizedBridgeRequest(request, env)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/imap/accounts") {
    const accounts = await getImapAccounts(env.DB);
    return Response.json(accounts.map(toImapBridgeAccount));
  }

  if (request.method === "POST" && url.pathname === "/api/imap/push") {
    const body = await readJson(request);
    if (!isImapBridgePushBody(body)) {
      return Response.json({ error: "Bad Request" }, { status: 400 });
    }

    await ImapProvider.enqueue(body, env);
    return new Response("OK");
  }

  return new Response("Not Found", { status: 404 });
};

const getContainerEnvVars = (): Record<string, string> => {
  const vars: Record<string, string> = {
    NODE_ENV: "production",
    PORT: "3000",
    BRIDGE_SECRET: workerEnv.IMAP_BRIDGE_SECRET ?? "",
    TELEMAIL_URL: TELEMAIL_WORKER_INTERNAL_ORIGIN,
  };

  if (workerEnv.IMAP_BRIDGE_REDIS_URL) {
    vars.REDIS_URL = workerEnv.IMAP_BRIDGE_REDIS_URL;
  }

  return vars;
};

const isAuthorizedBridgeRequest = (request: Request, env: Env): boolean => {
  const expected = env.IMAP_BRIDGE_SECRET;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  return !!provided && timingSafeEqual(provided, expected);
};

const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};
