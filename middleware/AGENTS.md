# Middleware — Agent Guide

IMAP bridge (Bun + Elysia + ImapFlow + 可选 Redis)。**不在 Cloudflare 上跑** —— Workers 没有原生 TCP / 长连接 socket，IDLE 跑不起来。这个 service 替 worker hold IMAP 连接，把"新邮件到达"事件 push 给 worker。Cross-workspace rules in [root AGENTS.md](../AGENTS.md)。

## Conventions

- **Redis 是可选的**: `REDIS_URL` 给了 → `lastUid` 每账号 survives restart；没给 → 内存里。
- **Periodic refresh** (`REFRESH_INTERVAL_MS`，默认 5 min)：close + reconnect 每个 client 防 IDLE 静默卡死（iCloud 之类的 server 经常这样）。
- **Reconnect 是手动的**: ImapFlow 不自动重连。`close` 事件 → `scheduleReconnect` → 等 `RECONNECT_DELAY_MS` (3s) → 新 `ImapFlow` 实例。每账号一个 timer guard 防止堆栈。
- **Stale client guard**: event handler 注册时**捕获当前 `ImapFlow` ref**，old client 触发的事件直接忽略 —— 加新 handler 时务必保留这个 pattern。
- **Health endpoint 不鉴权**: 只返 `{ ok, total, usable }` 计数，**永远不要**暴露邮箱地址 / 密码。

## ImapFlow 特性 ([docs](https://imapflow.com/docs/guides/basic-usage/))

- **Auto-IDLE**: 15s 内无 command 自动进 IDLE，发任何 command 前自动 `DONE`。**不要手动管 IDLE**。
- **No-IDLE fallback**: 我们传 `missingIdleCommand: "STATUS"`（默认 `NOOP` 不可靠，`SELECT` 会循环）。
- **永远别在 `fetch()` iterator 里跑 IMAP command** —— 会死锁。
- **`fetch` / `search` 一律加 `{ uid: true }`** —— UID 跨 session 稳定，sequence number 不稳。
- **Lock discipline**: `getMailboxLock()` 后必须 `try { ... } finally { lock.release() }`。
- **Special-use flags**: `\Inbox` `\Sent` `\Drafts` `\Trash` `\Junk` `\Archive` 从 `client.list()` 拿，**不要硬编码**文件夹名。
