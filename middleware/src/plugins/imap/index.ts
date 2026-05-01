import { connectionManager } from "@middleware/connections";
import type { ActiveConnection } from "@middleware/connections/types";
import { Elysia } from "elysia";
import type {
  FolderHint,
  LocateResult,
  MessageSummary,
  SearchResultMessage,
} from "./types";
import {
  findArchiveFolder,
  findJunkFolder,
  findTrashFolder,
  resolveArchiveFolder,
  resolveFolderForHint,
} from "./utils/folders";
import {
  findUidByMessageId,
  findUidInMailbox,
  locateMessage,
  searchAndFetch,
} from "./utils/search";

const Imap = {
  /**
   * 给邮件设置 / 清除 flag（seen, flagged 等）。
   *
   * 默认在 INBOX 操作；调用方明确知道邮件在 junk / archive（如 mail 预览页用
   * `fetchFolder` 拉的）就传 `folderHint`，直接去对应 folder 不用瞎猜。找不到对应
   * 文件夹 / Message-Id 都返回 false 走 best-effort（调用方不依赖返回值）。
   */
  async setFlag(
    accountId: number,
    rfcMessageId: string,
    flag: string,
    add: boolean,
    folderHint?: FolderHint,
    archiveFolder?: string,
  ): Promise<boolean> {
    const raw = connectionManager.getConnection(accountId);
    if (!raw?.client) {
      console.warn(`[Account ${accountId}] setFlag: no active connection`);
      return false;
    }
    const conn = raw as ActiveConnection;

    const folder = await resolveFolderForHint(conn, folderHint, archiveFolder);
    if (folder === null) {
      console.warn(
        `[Account ${accountId}] setFlag: junk folder not found for hint=junk`,
      );
      return false;
    }

    const lock = await conn.client.getMailboxLock(folder);
    try {
      const uid = await findUidInMailbox(conn.client, rfcMessageId);
      if (uid === null) {
        console.warn(
          `[Account ${accountId}] setFlag: Message-Id not found in ${folder}: ${rfcMessageId}`,
        );
        return false;
      }
      if (add) {
        await conn.client.messageFlagsAdd([uid], [flag], { uid: true });
      } else {
        await conn.client.messageFlagsRemove([uid], [flag], { uid: true });
      }
      console.log(
        `[Account ${accountId}] ${add ? "+" : "-"}${flag} for UID ${uid} in ${folder}`,
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
    folderHint?: FolderHint,
    archiveFolder?: string,
  ): Promise<string> {
    const conn = connectionManager.requireConnection(accountId, "fetchEmail");

    // 调用方 hint 是权威 —— 单 folder 操作，不做跨 folder fallback。
    const folder = await resolveFolderForHint(conn, folderHint, archiveFolder);
    if (folder === null) {
      throw new Error(
        `[Account ${accountId}] fetchEmail: junk folder not found for hint=junk`,
      );
    }

    const lock = await conn.client.getMailboxLock(folder);
    try {
      const uid = await findUidInMailbox(conn.client, rfcMessageId);
      if (uid === null) {
        throw new Error(
          `[Account ${accountId}] fetchEmail: Message-Id not found in ${folder}: ${rfcMessageId}`,
        );
      }
      const msg = await conn.client.fetchOne(
        String(uid),
        { source: true },
        { uid: true },
      );
      if (!msg || typeof msg === "boolean" || !msg.source) {
        throw new Error(
          `[Account ${accountId}] fetchEmail: empty source for UID ${uid} in ${folder}`,
        );
      }
      console.log(
        `[Account ${accountId}] Fetched Message-Id ${rfcMessageId} from ${folder} (UID ${uid})`,
      );
      return Buffer.from(msg.source).toString("base64");
    } finally {
      lock.release();
    }
  },

  async listUnread(
    accountId: number,
    maxResults: number = 20,
  ): Promise<MessageSummary[]> {
    const conn = connectionManager.requireConnection(accountId, "listUnread");
    return searchAndFetch(conn, "INBOX", { seen: false }, maxResults);
  },

  async listStarred(
    accountId: number,
    maxResults: number = 20,
  ): Promise<MessageSummary[]> {
    const conn = connectionManager.requireConnection(accountId, "listStarred");
    return searchAndFetch(conn, "INBOX", { flagged: true }, maxResults);
  },

  async listJunk(
    accountId: number,
    maxResults: number = 20,
  ): Promise<MessageSummary[]> {
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
  ): Promise<SearchResultMessage[]> {
    const conn = connectionManager.requireConnection(accountId, "search");
    const trimmed = query.trim();
    if (!trimmed) return [];

    // 并发查 Redis 缓存。`findArchiveFolder` 返回非 null 即说明该 folder 在
    // server 上存在（不会返回 fallback 字面量），省掉额外一次 IMAP `LIST` 验证。
    const [junkPath, archivePath] = await Promise.all([
      findJunkFolder(conn),
      findArchiveFolder(conn),
    ]);
    const folders = ["INBOX", junkPath, archivePath]
      .filter((f): f is string => !!f)
      .filter((f, i, arr) => arr.indexOf(f) === i);

    const all: SearchResultMessage[] = [];
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
    const dedup: SearchResultMessage[] = [];
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
  ): Promise<MessageSummary[]> {
    const conn = connectionManager.requireConnection(accountId, "listFolder");

    // 没传 folder 时走自动探测（`findArchiveFolder` 返回非 null 即存在），跳过
    // 一次 IMAP `LIST` 验证；用户自定义路径才需要查存在性。
    let resolved: string | null;
    if (folder) {
      const mailboxes = await conn.client.list();
      resolved = mailboxes.some((m) => m.path === folder || m.name === folder)
        ? folder
        : null;
    } else {
      resolved = await findArchiveFolder(conn);
    }
    if (!resolved) {
      console.log(
        `[Account ${accountId}] listFolder: archive folder not found, returning empty`,
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

    // 用户没传 folder 且 `findArchiveFolder` 命中（Redis 或 server LIST 返回非
    // null）即说明该 folder 在 server 上存在；直接跳过 `list()` + `mailboxCreate`
    // 这条慢路径。只有用户自定义 / 兜底字面量 "Archive" 才需要查存在性 + 建。
    let resolved: string;
    let needsCreate = false;
    if (folder) {
      resolved = folder;
      needsCreate = true;
    } else {
      const auto = await findArchiveFolder(conn);
      if (auto) {
        resolved = auto;
      } else {
        resolved = "Archive";
        needsCreate = true;
      }
    }
    if (needsCreate) {
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
    }

    const lock = await conn.client.getMailboxLock("INBOX");
    try {
      const uid = await findUidInMailbox(conn.client, rfcMessageId);
      if (uid === null) {
        throw new Error(
          `[Account ${accountId}] archiveMessage: Message-Id not in INBOX: ${rfcMessageId}`,
        );
      }
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
      const uid = await findUidInMailbox(conn.client, rfcMessageId);
      if (uid === null) {
        throw new Error(
          `[Account ${accountId}] markAsJunk: Message-Id not in INBOX: ${rfcMessageId}`,
        );
      }
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
      const uid = await findUidInMailbox(conn.client, rfcMessageId);
      if (uid === null) {
        throw new Error(
          `[Account ${accountId}] moveToInbox: Message-Id not in ${junkPath}: ${rfcMessageId}`,
        );
      }
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
      const uid = await findUidInMailbox(conn.client, rfcMessageId);
      if (uid === null) {
        throw new Error(
          `[Account ${accountId}] unarchiveMessage: Message-Id not in ${resolved}: ${rfcMessageId}`,
        );
      }
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
  ): Promise<LocateResult> {
    const conn = connectionManager.requireConnection(accountId, "locate");

    // INBOX —— 命中就顺带读星标状态
    {
      const lock = await conn.client.getMailboxLock("INBOX");
      try {
        const uid = await findUidInMailbox(conn.client, rfcMessageId);
        if (uid !== null) {
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

    // archive 可能尚未创建（首次归档时才建），不存在就跳过。用户自定义路径才需要
    // `client.list()` 验证；走自动探测 (`findArchiveFolder`) 时返回非 null 即存在，
    // 直接省掉那次 IMAP 往返。
    const archivePath = archiveFolder
      ? (await conn.client.list()).some(
          (m) => m.path === archiveFolder || m.name === archiveFolder,
        )
        ? archiveFolder
        : null
      : await findArchiveFolder(conn);
    if (
      archivePath &&
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

  async isStarred(
    accountId: number,
    rfcMessageId: string,
    folderHint?: FolderHint,
    archiveFolder?: string,
  ): Promise<boolean> {
    const conn = connectionManager.requireConnection(accountId, "isStarred");

    const folder = await resolveFolderForHint(conn, folderHint, archiveFolder);
    if (folder === null) return false;

    const lock = await conn.client.getMailboxLock(folder);
    try {
      // 拆成两步（先按 Message-Id 拿 UID，再查 flagged）—— 部分服务器（iCloud）
      // SEARCH 把 header 和 flagged 合在一个请求时不命中，分开走稳定。
      const uid = await findUidInMailbox(conn.client, rfcMessageId);
      if (uid === null) return false;
      const flagged = await conn.client.search(
        { uid: `${uid}`, flagged: true },
        { uid: true },
      );
      return Array.isArray(flagged) && (flagged as number[]).includes(uid);
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

    // 三个特殊 folder 走 Redis 缓存并发拉。findArchiveFolder 非 null 即存在，
    // 不需要额外 `client.list()` 验证。
    const [junkPath, archivePath, trashPath] = await Promise.all([
      findJunkFolder(conn),
      findArchiveFolder(conn),
      findTrashFolder(conn),
    ]);
    const candidates = ["INBOX", junkPath, archivePath].filter(
      (f): f is string => !!f,
    );
    const hit = await locateMessage(conn, rfcMessageId, candidates);
    if (!hit) {
      throw new Error(
        `[Account ${accountId}] trashMessage: Message-Id not found: ${rfcMessageId}`,
      );
    }

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
