import { Elysia } from "elysia";
import {
  type ActiveConnection,
  connectionManager,
} from "../utils/imap-connection";

const findSpecialFolder = async (
  conn: ActiveConnection,
  specialUse: string,
  nameMatches: string[],
): Promise<string | null> => {
  const mailboxes = await conn.client.list();
  const box =
    mailboxes.find((m) => m.specialUse === specialUse) ??
    mailboxes.find((m) => nameMatches.includes(m.name.toLowerCase()));
  return box?.path ?? null;
};

const findJunkFolder = (conn: ActiveConnection) =>
  findSpecialFolder(conn, "\\Junk", ["junk", "junk email", "spam"]);

const findTrashFolder = (conn: ActiveConnection) =>
  findSpecialFolder(conn, "\\Trash", [
    "trash",
    "deleted items",
    "deleted messages",
    "bin",
  ]);

const findArchiveFolder = (conn: ActiveConnection) =>
  findSpecialFolder(conn, "\\Archive", [
    "archive",
    "archives",
    "all mail",
    "[gmail]/all mail",
  ]);

/**
 * 解析归档目标文件夹：
 * 1. 调用方显式指定 → 用指定的
 * 2. 否则查 `\Archive` special-use / 常见名字
 * 3. 都没有 → fallback 到字面量 "Archive"
 */
async function resolveArchiveFolder(
  conn: ActiveConnection,
  explicit: string | undefined,
): Promise<string> {
  if (explicit) return explicit;
  return (await findArchiveFolder(conn)) ?? "Archive";
}

/**
 * 在 `folder` 里按 RFC 822 Message-Id 搜 UID。多条匹配时取最新（UID 最大）。
 * 没找到返回 null；folder 不存在 / 无权限 → 抛错由调用方处理。
 */
async function findUidByMessageId(
  conn: ActiveConnection,
  folder: string,
  rfcMessageId: string,
): Promise<number | null> {
  const lock = await conn.client.getMailboxLock(folder);
  try {
    const hits = await conn.client.search(
      { header: { "message-id": rfcMessageId } },
      { uid: true },
    );
    if (!Array.isArray(hits) || hits.length === 0) return null;
    return (hits as number[]).sort((a, b) => b - a)[0];
  } finally {
    lock.release();
  }
}

/** 在候选文件夹里依次按 Message-Id 搜索，返回命中的 `{folder, uid}` 或 null */
async function locateMessage(
  conn: ActiveConnection,
  rfcMessageId: string,
  folders: string[],
): Promise<{ folder: string; uid: number } | null> {
  for (const folder of folders) {
    const uid = await findUidByMessageId(conn, folder, rfcMessageId);
    if (uid !== null) return { folder, uid };
  }
  return null;
}

/**
 * `fetchEmail` 要在哪些文件夹里找 Message-Id —— 不同 hint 给出不同候选顺序。
 * 顺序决定了命中速度 + 歧义（同一 Message-Id 极少数情况会在 All Mail + INBOX
 * 同时存在，hint 让调用方主导选哪封）。
 */
async function resolveFetchCandidates(
  conn: ActiveConnection,
  folderHint: "inbox" | "junk" | "archive" | undefined,
  archiveFolder: string | undefined,
): Promise<string[]> {
  const junk = async () => (await findJunkFolder(conn)) ?? undefined;
  const archive = () => resolveArchiveFolder(conn, archiveFolder);

  switch (folderHint) {
    case "archive":
      return [await archive()];
    case "junk": {
      const j = await junk();
      return j ? [j, "INBOX"] : ["INBOX"];
    }
    default: {
      const j = await junk();
      return j ? ["INBOX", j] : ["INBOX"];
    }
  }
}

async function searchAndFetch(
  conn: ActiveConnection,
  folder: string,
  searchQuery: Record<string, unknown>,
  maxResults: number,
): Promise<{ id: string; subject?: string }[]> {
  const lock = await conn.client.getMailboxLock(folder);
  try {
    const result = await conn.client.search(searchQuery, { uid: true });
    if (!result || !Array.isArray(result)) return [];
    const uids = (result as number[])
      .sort((a: number, b: number) => b - a)
      .slice(0, maxResults);
    if (uids.length === 0) return [];

    const range = uids.join(",");
    const fetched = await conn.client.fetchAll(
      range,
      { envelope: true },
      { uid: true },
    );
    // 无 Message-Id 的邮件（罕见）直接跳过 —— 没法跨 folder 追踪，后续 action 也做不了
    return fetched
      .filter((msg) => !!msg.envelope?.messageId)
      .map((msg) => ({
        id: msg.envelope?.messageId as string,
        subject: msg.envelope?.subject ?? undefined,
      }));
  } finally {
    lock.release();
  }
}

const Imap = {
  /**
   * 给 INBOX 里的邮件设置 / 清除 flag（seen, flagged 等）。
   * 按 Message-Id SEARCH HEADER 拿 UID，再 STORE flag。
   */
  async setFlag(
    accountId: number,
    rfcMessageId: string,
    flag: string,
    add: boolean,
  ): Promise<boolean> {
    const conn = connectionManager.getConnection(accountId);
    if (!conn || !conn.client) {
      console.warn(`[Account ${accountId}] setFlag: no active connection`);
      return false;
    }

    const lock = await conn.client.getMailboxLock("INBOX");
    try {
      const hits = await conn.client.search(
        { header: { "message-id": rfcMessageId } },
        { uid: true },
      );
      if (!Array.isArray(hits) || hits.length === 0) {
        console.warn(
          `[Account ${accountId}] setFlag: Message-Id not found in INBOX: ${rfcMessageId}`,
        );
        return false;
      }
      const uid = (hits as number[]).sort((a, b) => b - a)[0];
      if (add) {
        await conn.client.messageFlagsAdd([uid], [flag], { uid: true });
      } else {
        await conn.client.messageFlagsRemove([uid], [flag], { uid: true });
      }
      console.log(
        `[Account ${accountId}] ${add ? "+" : "-"}${flag} for UID ${uid}`,
      );
      return true;
    } catch (err: unknown) {
      console.warn(
        `[Account ${accountId}] setFlag error:`,
        err instanceof Error ? err.message : err,
      );
      return false;
    } finally {
      lock.release();
    }
  },

  /**
   * 把 INBOX 里所有未读邮件一次性标记为已读。SEARCH `seen=false` 拿到 UID 集合，
   * 一次 STORE `+\Seen` 整批扫掉 —— IMAP 协议原生支持 UID 集合操作，所以这是
   * 单条 IMAP 命令搞定整 INBOX，不存在 N+1。
   */
  async markAllAsRead(accountId: number): Promise<{ count: number }> {
    const conn = connectionManager.requireConnection(
      accountId,
      "markAllAsRead",
    );
    const lock = await conn.client.getMailboxLock("INBOX");
    try {
      const hits = await conn.client.search({ seen: false }, { uid: true });
      if (!Array.isArray(hits) || hits.length === 0) return { count: 0 };
      await conn.client.messageFlagsAdd(hits as number[], ["\\Seen"], {
        uid: true,
      });
      console.log(
        `[Account ${accountId}] Marked ${hits.length} INBOX messages as Seen`,
      );
      return { count: hits.length };
    } finally {
      lock.release();
    }
  },

  async fetchEmail(
    accountId: number,
    rfcMessageId: string,
    folderHint?: "inbox" | "junk" | "archive",
    archiveFolder?: string,
  ): Promise<string> {
    const conn = connectionManager.requireConnection(accountId, "fetchEmail");
    const folders = await resolveFetchCandidates(
      conn,
      folderHint,
      archiveFolder,
    );

    for (const folder of folders) {
      const lock = await conn.client.getMailboxLock(folder);
      try {
        const hits = await conn.client.search(
          { header: { "message-id": rfcMessageId } },
          { uid: true },
        );
        if (!Array.isArray(hits) || hits.length === 0) continue;
        const uid = (hits as number[]).sort((a, b) => b - a)[0];
        const msg = await conn.client.fetchOne(
          String(uid),
          { source: true },
          { uid: true },
        );
        if (msg && typeof msg !== "boolean" && msg.source) {
          console.log(
            `[Account ${accountId}] Fetched Message-Id ${rfcMessageId} from ${folder} (UID ${uid})`,
          );
          return Buffer.from(msg.source).toString("base64");
        }
      } finally {
        lock.release();
      }
    }

    throw new Error(
      `[Account ${accountId}] fetchEmail: Message-Id ${rfcMessageId} not found in ${folders.join(", ")}`,
    );
  },

  async listUnread(
    accountId: number,
    maxResults: number = 20,
  ): Promise<{ id: string; subject?: string }[]> {
    const conn = connectionManager.requireConnection(accountId, "listUnread");
    return searchAndFetch(conn, "INBOX", { seen: false }, maxResults);
  },

  async listStarred(
    accountId: number,
    maxResults: number = 20,
  ): Promise<{ id: string; subject?: string }[]> {
    const conn = connectionManager.requireConnection(accountId, "listStarred");
    return searchAndFetch(conn, "INBOX", { flagged: true }, maxResults);
  },

  async listJunk(
    accountId: number,
    maxResults: number = 20,
  ): Promise<{ id: string; subject?: string }[]> {
    const conn = connectionManager.requireConnection(accountId, "listJunk");
    const junkPath = await findJunkFolder(conn);
    if (!junkPath) return [];
    return searchAndFetch(conn, junkPath, { all: true }, maxResults);
  },

  /**
   * 按用户输入跨 INBOX / junk / archive 全文检索。
   * 用 ImapFlow `search({ text })` —— 服务器端 IMAP `SEARCH TEXT`，匹配
   * headers + body。多 folder 并行 SELECT+SEARCH，结果按 envelope.date
   * 倒序合并后截断到 maxResults。
   */
  async searchMessages(
    accountId: number,
    query: string,
    maxResults: number = 20,
  ): Promise<{ id: string; subject?: string; from?: string; date?: string }[]> {
    const conn = connectionManager.requireConnection(accountId, "search");
    const trimmed = query.trim();
    if (!trimmed) return [];

    const junkPath = await findJunkFolder(conn);
    const archivePath = await resolveArchiveFolder(conn, undefined);
    const mailboxes = await conn.client.list();
    const archiveExists = mailboxes.some(
      (m) => m.path === archivePath || m.name === archivePath,
    );
    const folders = ["INBOX", junkPath, archiveExists ? archivePath : null]
      .filter((f): f is string => !!f)
      .filter((f, i, arr) => arr.indexOf(f) === i);

    const all: {
      id: string;
      subject?: string;
      from?: string;
      date?: string;
    }[] = [];
    for (const folder of folders) {
      const lock = await conn.client.getMailboxLock(folder);
      try {
        const result = await conn.client.search(
          { text: trimmed },
          { uid: true },
        );
        if (!result || !Array.isArray(result) || result.length === 0) continue;
        const uids = (result as number[])
          .sort((a, b) => b - a)
          .slice(0, maxResults);
        const fetched = await conn.client.fetchAll(
          uids.join(","),
          { envelope: true },
          { uid: true },
        );
        for (const msg of fetched) {
          if (!msg.envelope?.messageId) continue;
          // envelope.from 是 [{ name, address }, ...]；取第一个发件人，兼顾 name-only / addr-only
          const f = msg.envelope.from?.[0];
          const from = f?.address
            ? f.name
              ? `${f.name} <${f.address}>`
              : f.address
            : (f?.name ?? undefined);
          all.push({
            id: msg.envelope.messageId,
            subject: msg.envelope.subject ?? undefined,
            from,
            date: msg.envelope.date
              ? new Date(msg.envelope.date).toISOString()
              : undefined,
          });
        }
      } catch (err) {
        console.warn(
          `[Account ${accountId}] search '${folder}' error:`,
          err instanceof Error ? err.message : err,
        );
      } finally {
        lock.release();
      }
    }

    // 同一 Message-Id 可能在 INBOX + Gmail All Mail 同时出现，按 id 去重保留首条。
    const seen = new Set<string>();
    const dedup: typeof all = [];
    for (const m of all) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      dedup.push(m);
    }
    dedup.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return dedup.slice(0, maxResults);
  },

  async listFolder(
    accountId: number,
    folder: string | undefined,
    maxResults: number = 20,
  ): Promise<{ id: string; subject?: string }[]> {
    const conn = connectionManager.requireConnection(accountId, "listFolder");
    const resolved = await resolveArchiveFolder(conn, folder);
    // 文件夹不存在时返回空（避免 getMailboxLock 抛错导致请求失败）
    const mailboxes = await conn.client.list();
    const exists = mailboxes.some(
      (m) => m.path === resolved || m.name === resolved,
    );
    if (!exists) {
      console.log(
        `[Account ${accountId}] listFolder: '${resolved}' not found, returning empty`,
      );
      return [];
    }
    return searchAndFetch(conn, resolved, { all: true }, maxResults);
  },

  async archiveMessage(
    accountId: number,
    rfcMessageId: string,
    folder: string | undefined,
  ): Promise<void> {
    const conn = connectionManager.requireConnection(
      accountId,
      "archiveMessage",
    );
    const resolved = await resolveArchiveFolder(conn, folder);

    // 不存在就创建
    const mailboxes = await conn.client.list();
    const exists = mailboxes.some(
      (m) => m.path === resolved || m.name === resolved,
    );
    if (!exists) {
      await conn.client.mailboxCreate(resolved);
      console.log(
        `[Account ${accountId}] Created archive folder '${resolved}'`,
      );
    }

    const lock = await conn.client.getMailboxLock("INBOX");
    try {
      const hits = await conn.client.search(
        { header: { "message-id": rfcMessageId } },
        { uid: true },
      );
      if (!Array.isArray(hits) || hits.length === 0) {
        throw new Error(
          `[Account ${accountId}] archiveMessage: Message-Id not in INBOX: ${rfcMessageId}`,
        );
      }
      const uid = (hits as number[]).sort((a, b) => b - a)[0];
      await conn.client.messageMove([uid], resolved, { uid: true });
      console.log(
        `[Account ${accountId}] Archived UID ${uid} from INBOX to ${resolved}`,
      );
    } finally {
      lock.release();
    }
  },

  /**
   * 按 RFC Message-Id 在 junk folder 里做 `SEARCH HEADER Message-Id` —— 邮件一旦被移动，
   * 原 INBOX UID 在 junk folder 里完全对不上号（UID 是 per-folder 的），所以必须用
   * 全局唯一的 Message-Id。
   */
  async isJunk(accountId: number, rfcMessageId: string): Promise<boolean> {
    const conn = connectionManager.requireConnection(accountId, "isJunk");

    const junkPath = await findJunkFolder(conn);
    if (!junkPath) return false;

    const uid = await findUidByMessageId(conn, junkPath, rfcMessageId);
    return uid !== null;
  },

  async markAsJunk(accountId: number, rfcMessageId: string): Promise<void> {
    const conn = connectionManager.requireConnection(accountId, "markAsJunk");

    const junkPath = await findJunkFolder(conn);
    if (!junkPath)
      throw new Error(
        `[Account ${accountId}] markAsJunk: junk folder not found`,
      );

    const lock = await conn.client.getMailboxLock("INBOX");
    try {
      const hits = await conn.client.search(
        { header: { "message-id": rfcMessageId } },
        { uid: true },
      );
      if (!Array.isArray(hits) || hits.length === 0) {
        throw new Error(
          `[Account ${accountId}] markAsJunk: Message-Id not in INBOX: ${rfcMessageId}`,
        );
      }
      const uid = (hits as number[]).sort((a, b) => b - a)[0];
      await conn.client.messageMove([uid], junkPath, { uid: true });
      console.log(
        `[Account ${accountId}] Moved UID ${uid} from INBOX to ${junkPath}`,
      );
    } finally {
      lock.release();
    }
  },

  async moveToInbox(accountId: number, rfcMessageId: string): Promise<void> {
    const conn = connectionManager.requireConnection(accountId, "moveToInbox");

    const junkPath = await findJunkFolder(conn);
    if (!junkPath)
      throw new Error(
        `[Account ${accountId}] moveToInbox: junk folder not found`,
      );

    const lock = await conn.client.getMailboxLock(junkPath);
    try {
      const hits = await conn.client.search(
        { header: { "message-id": rfcMessageId } },
        { uid: true },
      );
      if (!Array.isArray(hits) || hits.length === 0) {
        throw new Error(
          `[Account ${accountId}] moveToInbox: Message-Id not in ${junkPath}: ${rfcMessageId}`,
        );
      }
      const uid = (hits as number[]).sort((a, b) => b - a)[0];
      await conn.client.messageMove([uid], "INBOX", { uid: true });
      console.log(
        `[Account ${accountId}] Moved UID ${uid} from ${junkPath} to INBOX`,
      );
    } finally {
      lock.release();
    }
  },

  async unarchiveMessage(
    accountId: number,
    rfcMessageId: string,
    archiveFolder?: string,
  ): Promise<void> {
    const conn = connectionManager.requireConnection(
      accountId,
      "unarchiveMessage",
    );
    const resolved = await resolveArchiveFolder(conn, archiveFolder);

    const lock = await conn.client.getMailboxLock(resolved);
    try {
      const hits = await conn.client.search(
        { header: { "message-id": rfcMessageId } },
        { uid: true },
      );
      if (!Array.isArray(hits) || hits.length === 0) {
        throw new Error(
          `[Account ${accountId}] unarchiveMessage: Message-Id not in ${resolved}: ${rfcMessageId}`,
        );
      }
      const uid = (hits as number[]).sort((a, b) => b - a)[0];
      await conn.client.messageMove([uid], "INBOX", { uid: true });
      console.log(
        `[Account ${accountId}] Moved UID ${uid} from ${resolved} to INBOX`,
      );
    } finally {
      lock.release();
    }
  },

  /**
   * 按 RFC Message-Id 跨 folder 搜索邮件当前位置，用于 reconciliation。
   *
   * 优先级：INBOX → junk → archive → trash → deleted。
   *  - 先查 INBOX：命中就读 `\\Flagged` 返回 `{ inbox, starred }`
   *  - 否则依次查 junk / archive / trash，首个命中的 folder 决定 location
   *  - 都没找到 → `deleted`
   *
   * 注：Gmail IMAP 下 All Mail folder 和 INBOX 会同时持有 message，但顺序把 INBOX
   * 放最前，所以仍在 inbox 的邮件不会被误判为 archive。每个 folder 一次 SEARCH HEADER
   * Message-Id，加起来最多 4 次 SELECT+SEARCH，refresh 触点可接受。
   */
  async locate(
    accountId: number,
    rfcMessageId: string,
    archiveFolder?: string,
  ): Promise<{
    location: "inbox" | "junk" | "archive" | "deleted";
    starred?: boolean;
  }> {
    const conn = connectionManager.requireConnection(accountId, "locate");

    // INBOX —— 命中就顺带读星标状态
    {
      const lock = await conn.client.getMailboxLock("INBOX");
      try {
        const hits = await conn.client.search(
          { header: { "message-id": rfcMessageId } },
          { uid: true },
        );
        if (Array.isArray(hits) && hits.length > 0) {
          const uid = (hits as number[]).sort((a, b) => b - a)[0];
          const flagged = await conn.client.search(
            { uid: `${uid}`, flagged: true },
            { uid: true },
          );
          const starred =
            Array.isArray(flagged) && (flagged as number[]).includes(uid);
          return { location: "inbox", starred };
        }
      } finally {
        lock.release();
      }
    }

    const junkPath = await findJunkFolder(conn);
    if (junkPath && (await findUidByMessageId(conn, junkPath, rfcMessageId))) {
      return { location: "junk" };
    }

    // archive 可能尚未创建（首次归档时才建），不存在就跳过
    const archivePath = await resolveArchiveFolder(conn, archiveFolder);
    const mailboxes = await conn.client.list();
    const archiveExists = mailboxes.some(
      (m) => m.path === archivePath || m.name === archivePath,
    );
    if (
      archiveExists &&
      (await findUidByMessageId(conn, archivePath, rfcMessageId))
    ) {
      return { location: "archive" };
    }

    const trashPath = await findTrashFolder(conn);
    if (
      trashPath &&
      (await findUidByMessageId(conn, trashPath, rfcMessageId))
    ) {
      return { location: "deleted" };
    }

    return { location: "deleted" };
  },

  async isStarred(accountId: number, rfcMessageId: string): Promise<boolean> {
    const conn = connectionManager.requireConnection(accountId, "isStarred");

    const lock = await conn.client.getMailboxLock("INBOX");
    try {
      const hits = await conn.client.search(
        { header: { "message-id": rfcMessageId }, flagged: true },
        { uid: true },
      );
      return Array.isArray(hits) && hits.length > 0;
    } finally {
      lock.release();
    }
  },

  /**
   * 按 Message-Id 删除：在 INBOX / junk / archive 里找到这封邮件，然后移到 trash
   * （没 trash 就 `\Deleted` expunge）。移动源不限于固定 folder —— trash 按钮
   * 从哪个预览点击都得能工作。
   */
  async trashMessage(accountId: number, rfcMessageId: string): Promise<void> {
    const conn = connectionManager.requireConnection(accountId, "trashMessage");

    const junkPath = await findJunkFolder(conn);
    const archivePath = await resolveArchiveFolder(conn, undefined);
    const mailboxes = await conn.client.list();
    const archiveExists = mailboxes.some(
      (m) => m.path === archivePath || m.name === archivePath,
    );

    const candidates = [
      "INBOX",
      junkPath,
      archiveExists ? archivePath : null,
    ].filter((f): f is string => !!f);
    const hit = await locateMessage(conn, rfcMessageId, candidates);
    if (!hit) {
      throw new Error(
        `[Account ${accountId}] trashMessage: Message-Id not found: ${rfcMessageId}`,
      );
    }

    const trashPath = await findTrashFolder(conn);
    const lock = await conn.client.getMailboxLock(hit.folder);
    try {
      if (trashPath) {
        await conn.client.messageMove([hit.uid], trashPath, { uid: true });
        console.log(
          `[Account ${accountId}] Moved UID ${hit.uid} from ${hit.folder} to ${trashPath}`,
        );
      } else {
        await conn.client.messageDelete([hit.uid], { uid: true });
        console.log(
          `[Account ${accountId}] Deleted UID ${hit.uid} from ${hit.folder} (no trash folder)`,
        );
      }
    } finally {
      lock.release();
    }
  },

  async trashAllJunk(accountId: number): Promise<number> {
    const conn = connectionManager.requireConnection(accountId, "trashAllJunk");

    const junkPath = await findJunkFolder(conn);
    if (!junkPath) return 0;

    const trashPath = await findTrashFolder(conn);

    const lock = await conn.client.getMailboxLock(junkPath);
    try {
      const result = await conn.client.search({ all: true }, { uid: true });
      if (!result || !Array.isArray(result) || result.length === 0) return 0;

      if (trashPath) {
        await conn.client.messageMove(result as number[], trashPath, {
          uid: true,
        });
        console.log(
          `[Account ${accountId}] Moved ${result.length} junk emails to ${trashPath}`,
        );
      } else {
        await conn.client.messageDelete(result as number[], { uid: true });
        console.log(
          `[Account ${accountId}] Deleted ${result.length} junk emails (no trash folder)`,
        );
      }
      return result.length;
    } finally {
      lock.release();
    }
  },
};

export const imap = new Elysia({ name: "imap" }).derive(
  { as: "global" },
  () => ({ imap: Imap }),
);
