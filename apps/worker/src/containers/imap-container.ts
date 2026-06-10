import { Container } from "@cloudflare/containers";
import { TELEMAIL_WORKER_INTERNAL_HOST } from "@middleware/constants";
import { getImapAccounts } from "@worker/db/accounts";
import {
  deleteImapBridgeFolderPaths,
  getImapBridgeFolderPath,
  getImapBridgeLastUid,
  type ImapBridgeFolderKind,
  putImapBridgeFolderPath,
  putImapBridgeLastUid,
} from "@worker/db/kv";
import { ImapProvider } from "@worker/providers/imap";
import type { Account, Env } from "@worker/types";
import { reportErrorToObservability } from "@worker/utils/observability";

interface ImapBridgePushBody {
  accountId: number;
  rfcMessageId: string;
}

interface LastUidStateBody {
  uid: number;
}

interface FolderStateBody {
  path: string | null;
}

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

  const stateResponse = await handleBridgeStateRequest(request, url, env);
  if (stateResponse) return stateResponse;

  return new Response("Not Found", { status: 404 });
};

const handleBridgeStateRequest = async (
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> => {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "imap" || parts[2] !== "state") {
    return null;
  }

  const accountId = parseAccountId(parts[4]);
  if (parts[3] === "last-uid" && accountId) {
    if (request.method === "GET") {
      const value = await getImapBridgeLastUid(env.EMAIL_KV, accountId);
      return Response.json({ value });
    }

    if (request.method === "PUT") {
      const body = await readJson(request);
      if (!isLastUidStateBody(body)) {
        return Response.json({ error: "Bad Request" }, { status: 400 });
      }
      await putImapBridgeLastUid(env.EMAIL_KV, accountId, body.uid);
      return new Response("OK");
    }
  }

  if (parts[3] === "folder" && accountId && isFolderKind(parts[5])) {
    const kind = parts[5];
    if (request.method === "GET") {
      const state = await getImapBridgeFolderPath(
        env.EMAIL_KV,
        accountId,
        kind,
      );
      return Response.json(state);
    }

    if (request.method === "PUT") {
      const body = await readJson(request);
      if (!isFolderStateBody(body)) {
        return Response.json({ error: "Bad Request" }, { status: 400 });
      }
      await putImapBridgeFolderPath(env.EMAIL_KV, accountId, kind, body.path);
      return new Response("OK");
    }
  }

  if (parts[3] === "folders" && accountId && request.method === "DELETE") {
    await deleteImapBridgeFolderPaths(env.EMAIL_KV, accountId);
    return new Response("OK");
  }

  return new Response("Not Found", { status: 404 });
};

const getContainerEnvVars = (): Record<string, string> => {
  return {
    NODE_ENV: "production",
    PORT: "3000",
  };
};

const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const parseAccountId = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const isFolderKind = (
  value: string | undefined,
): value is ImapBridgeFolderKind =>
  value === "junk" || value === "trash" || value === "archive";

const toImapBridgeAccount = (acc: Account) => ({
  id: acc.id,
  email: acc.email,
  chat_id: acc.chat_id,
  imap_host: acc.imap_host,
  imap_port: acc.imap_port,
  imap_secure: !!acc.imap_secure,
  imap_user: acc.imap_user,
  imap_pass: acc.imap_pass,
});

const isImapBridgePushBody = (body: unknown): body is ImapBridgePushBody => {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Partial<ImapBridgePushBody>;
  return (
    typeof candidate.accountId === "number" &&
    Number.isInteger(candidate.accountId) &&
    candidate.accountId > 0 &&
    typeof candidate.rfcMessageId === "string" &&
    candidate.rfcMessageId.length > 0
  );
};

const isLastUidStateBody = (body: unknown): body is LastUidStateBody => {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Partial<LastUidStateBody>;
  return (
    typeof candidate.uid === "number" &&
    Number.isInteger(candidate.uid) &&
    candidate.uid >= 0
  );
};

const isFolderStateBody = (body: unknown): body is FolderStateBody => {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Partial<FolderStateBody>;
  return candidate.path === null || typeof candidate.path === "string";
};
