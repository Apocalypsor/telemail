import type {
  ActiveConnection,
  Connection,
} from "@middleware/connections/types";
import {
  clearCachedFolders,
  getLastUid,
  setLastUid,
} from "@middleware/utils/state";
import {
  fetchImapAccounts,
  type ImapAccount,
  notifyNewEmail,
} from "@middleware/utils/telemail-client";
import { type ExistsEvent, ImapFlow } from "imapflow";
import { RECONNECT_DELAY_MS, REFRESH_INTERVAL_MS } from "../constants";

class ImapConnectionManager {
  private connections = new Map<number, Connection>();
  private reconnectTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private refreshTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private connecting = new Map<number, Promise<void>>();

  requireConnection = async (
    accountId: number,
    caller: string,
  ): Promise<ActiveConnection> => {
    const conn = this.connections.get(accountId);
    if (!conn?.active) {
      throw new Error(`[Account ${accountId}] ${caller}: no active connection`);
    }

    const activeConnection = this.getActiveConnection(conn);
    if (activeConnection) return activeConnection;

    if (conn.client) {
      const staleClient = conn.client;
      conn.client = null;
      staleClient.logout().catch(() => {});
    }

    this.clearTimer(this.reconnectTimers, accountId);
    await this.connect(conn);

    const reconnected = this.getActiveConnection(conn);
    if (!reconnected) {
      throw new Error(`[Account ${accountId}] ${caller}: no usable connection`);
    }

    return reconnected;
  };

  sync = async (): Promise<void> => {
    console.log("[ImapManager] Syncing accounts from Telemail...");
    const accounts = await fetchImapAccounts();
    const incomingIds = new Set(accounts.map((a) => a.id));

    for (const id of this.connections.keys()) {
      if (!incomingIds.has(id)) await this.stopConnection(id);
    }

    for (const account of accounts) {
      const existing = this.connections.get(account.id);
      if (existing) {
        if (!this.configChanged(existing.account, account)) continue;
        console.log(`[Account ${account.id}] Config changed, restarting`);
        await this.stopConnection(account.id);
      }
      await this.startConnection(account);
    }

    console.log(
      `[ImapManager] Active: ${[...this.connections.keys()].join(", ") || "none"}`,
    );
  };

  health = (): { ok: boolean; total: number; usable: number } => {
    const conns = [...this.connections.values()];
    const usable = conns.filter((c) => c.active && c.client?.usable).length;
    const ok = conns.length === 0 || usable > 0;
    return { ok, total: conns.length, usable };
  };

  list = (): { id: number; email: string; active: boolean }[] =>
    [...this.connections.values()].map((c) => ({
      id: c.account.id,
      email: c.account.email,
      active: c.active,
    }));

  // ---------------------------------------------------------------------------

  private configChanged = (a: ImapAccount, b: ImapAccount): boolean =>
    a.imap_host !== b.imap_host ||
    a.imap_port !== b.imap_port ||
    a.imap_secure !== b.imap_secure ||
    a.imap_user !== b.imap_user ||
    a.imap_pass !== b.imap_pass;

  private stopConnection = async (id: number): Promise<void> => {
    const conn = this.connections.get(id);
    if (!conn) return;
    conn.active = false;
    this.clearTimer(this.reconnectTimers, id);
    this.clearTimer(this.refreshTimers, id);
    this.connections.delete(id);
    await conn.client?.logout().catch(() => {});
    await clearCachedFolders(id);
    console.log(`[Account ${id}] Stopped`);
  };

  private startConnection = async (account: ImapAccount): Promise<void> => {
    const cachedUid = await getLastUid(account.id);
    const conn: Connection = {
      account,
      client: null,
      active: true,
      lastUid: cachedUid ?? 0,
    };
    if (cachedUid !== null) {
      console.log(
        `[Account ${account.id}] Restored lastUid from Worker KV: ${cachedUid}`,
      );
    }
    this.connections.set(account.id, conn);
    await this.connect(conn);
  };

  private clearTimer = (
    timers: Map<number, ReturnType<typeof setTimeout>>,
    id: number,
  ): void => {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
  };

  private getActiveConnection = (conn: Connection): ActiveConnection | null =>
    conn.client?.usable ? (conn as ActiveConnection) : null;

  private scheduleReconnect = (conn: Connection): void => {
    if (!conn.active) return;
    if (this.reconnectTimers.has(conn.account.id)) return;

    console.log(
      `[Account ${conn.account.id}] Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`,
    );
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(conn.account.id);
      this.connect(conn);
    }, RECONNECT_DELAY_MS);
    this.reconnectTimers.set(conn.account.id, timer);
  };

  private scheduleRefresh = (conn: Connection): void => {
    this.clearTimer(this.refreshTimers, conn.account.id);
    const timer = setTimeout(() => {
      this.refreshTimers.delete(conn.account.id);
      this.refreshConnection(conn);
    }, REFRESH_INTERVAL_MS);
    this.refreshTimers.set(conn.account.id, timer);
  };

  private refreshConnection = async (conn: Connection): Promise<void> => {
    if (!conn.active) return;
    console.log(
      `[Account ${conn.account.id}] Periodic refresh, reconnecting...`,
    );
    // Clear any pending reconnect to prevent double-connect
    this.clearTimer(this.reconnectTimers, conn.account.id);
    await this.connect(conn);
  };

  private connect = async (conn: Connection): Promise<void> => {
    if (!conn.active) return;
    const id = conn.account.id;
    const pending = this.connecting.get(id);
    if (pending) return pending;

    const nextConnection = this.establishConnection(conn);
    this.connecting.set(id, nextConnection);
    try {
      await nextConnection;
    } finally {
      this.connecting.delete(id);
    }
  };

  private establishConnection = async (conn: Connection): Promise<void> => {
    if (!conn.active) return;
    const id = conn.account.id;
    let client: ImapFlow | null = null;

    try {
      const nextClient = new ImapFlow({
        host: conn.account.imap_host,
        port: conn.account.imap_port,
        secure: conn.account.imap_secure,
        auth: { user: conn.account.imap_user, pass: conn.account.imap_pass },
        logger: false, // Disable imapflow's internal logging
        // For servers without IDLE, ImapFlow polls every 2 min. STATUS is the
        // most reliable fallback: NOOP relies on the server pushing untagged
        // EXISTS responses (not all do), and SELECT has a known loop issue.
        missingIdleCommand: "STATUS",
      });
      client = nextClient;

      await nextClient.connect();
      if (!conn.active) {
        await nextClient.logout().catch(() => {});
        return;
      }

      // Capture reference so stale event handlers from old clients are ignored
      nextClient.on("exists", async (data: ExistsEvent) => {
        if (!conn.active || conn.client !== nextClient) return;
        if (data.count <= data.prevCount) return;

        try {
          const lock = await nextClient.getMailboxLock("INBOX");
          try {
            conn.lastUid = await this.fetchNewMessages(
              conn,
              nextClient,
              conn.lastUid,
            );
            await setLastUid(id, conn.lastUid);
          } finally {
            lock.release();
          }
        } catch (err: unknown) {
          if (!conn.active) return;
          console.error(
            `[Account ${id}] exists handler error:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      });

      nextClient.on("error", (err: Error) => {
        if (!conn.active || conn.client !== nextClient) return;
        console.error(`[Account ${id}] IMAP error:`, err.message);
      });

      nextClient.on("close", () => {
        if (!conn.active || conn.client !== nextClient) return;
        conn.client = null;
        this.clearTimer(this.refreshTimers, id);
        console.log(
          `[Account ${id}] Connection closed, scheduling reconnect...`,
        );
        this.scheduleReconnect(conn);
      });

      const lock = await nextClient.getMailboxLock("INBOX");
      try {
        if (conn.lastUid === 0) {
          const mailbox = nextClient.mailbox || undefined;
          conn.lastUid = (mailbox?.uidNext ?? 1) - 1;
        } else {
          conn.lastUid = await this.fetchNewMessages(
            conn,
            nextClient,
            conn.lastUid,
          );
        }
        await setLastUid(conn.account.id, conn.lastUid);
      } finally {
        lock.release();
      }

      if (!nextClient.usable) {
        throw new Error("Connection not available after setup");
      }

      const oldClient = conn.client;
      conn.client = nextClient;
      if (oldClient && oldClient !== nextClient) {
        // Fire-and-forget: don't await logout — the old connection may be the
        // one that was stuck. Stale event handlers are guarded by client ref.
        oldClient.logout().catch(() => {});
      }

      console.log(
        `[Account ${id}] Connected to ${conn.account.imap_host} | watching from UID > ${conn.lastUid}`,
      );

      // Schedule periodic refresh to prevent IDLE stalls (e.g. iCloud)
      this.scheduleRefresh(conn);
    } catch (err: unknown) {
      if (!conn.active) return;
      console.error(
        `[Account ${id}] Connection error:`,
        err instanceof Error ? err.message : String(err),
      );
      if (conn.client === client) {
        conn.client = null;
      }
      await client?.logout().catch(() => {});
      this.scheduleReconnect(conn);
    }
  };

  private fetchNewMessages = async (
    conn: Connection,
    client: ImapFlow,
    lastUid: number,
  ): Promise<number> => {
    let newLastUid = lastUid;
    if (!client.usable) throw new Error("Connection not available");

    // 拉 envelope 取 Message-Id 作为通知 payload —— worker 以 RFC Message-Id 为
    // 邮件全局唯一标识，per-folder 的 UID 移出 INBOX 后就失效了
    for await (const msg of client.fetch(
      `${lastUid + 1}:*`,
      { uid: true, envelope: true },
      { uid: true },
    )) {
      if (msg.uid <= lastUid) continue;
      newLastUid = Math.max(newLastUid, msg.uid);

      const rfcMessageId = msg.envelope?.messageId;
      if (!rfcMessageId) {
        console.warn(
          `[Account ${conn.account.id}] UID ${msg.uid} has no Message-Id, skipping notify`,
        );
        continue;
      }

      console.log(
        `[Account ${conn.account.id}] New email UID ${msg.uid} (${rfcMessageId}), notifying Worker...`,
      );
      notifyNewEmail(conn.account.id, rfcMessageId).catch((err: unknown) => {
        console.error(
          `[Account ${conn.account.id}] Notify failed after retries (UID ${msg.uid}):`,
          err,
        );
      });
    }
    return newLastUid;
  };
}

export const connectionManager = new ImapConnectionManager();
