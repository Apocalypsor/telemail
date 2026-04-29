# Worker — Agent Guide

Cloudflare Worker (Hono). Cross-workspace rules in [root AGENTS.md](../AGENTS.md).

## Conventions

- **Layering**: `handlers/` 只做路由 / 鉴权 / req-resp shaping；业务逻辑必须落到 `services/` 或 provider 方法。handler 文件长 = 业务漏出来了。
- **Bot commands**: 默认仅私聊，由 `bot/index.ts` 注册的 `registerPrivateOnlyCommandGuard` 全局拦（也覆盖 `channel_post`）。新加 command 不用重复挡；`callback_query` 不受影响。
- **Email providers**: 抽象类在 `providers/base.ts`，barrel `providers/index.ts`。**永远不在 `providers/` 外 `branch on account.type`** —— 差异都体现在类上（static metadata、instance methods、`static registerRoutes(app)`）。
- **IMAP message id = RFC 822 Message-Id**（不是 per-folder UID）。bridge 全部接 `rfcMessageId`；UID 跨 folder 不稳。无 Message-Id 的邮件直接丢。Gmail / Outlook 用 native id。
- **Archive**: `provider.archiveMessage(id)` + `accountCanArchive(account)`。Gmail 需要用户挑 label (`accounts.archive_folder`)，缺了 `canArchive()` 返 false。
- **State reconciliation**: 所有 "remote → TG" 同步走 `reconcileMessageState` (`services/message-actions.ts`)。star pin 走 `syncStarPinState`。**不要**在多处分别 patch 状态。
- **Disable/enable**: `accounts.disabled` 暂停账号但保留数据。enforce 点：`services/bridge.ts::processEmailMessage`、push renewal、mail-list、`/sync`、`getImapAccounts`。
- **Cron**: 单 `* * * * *` 触发。每分钟 reminder dispatch；`getUTCMinutes() === 0` gate 小时批；午夜续订所有 push。
- **Email keyboard**: `buildEmailKeyboard` 需要 `tgMessageId`，所以投递流程是 send naked → insert message_map → build keyboard → `setReplyMarkup`。**单条代码路径**覆盖私聊 + 群聊。
- **Reminders**: 唯一入口是邮件消息上的 ⏰ 按钮。鉴权 `X-Telegram-Init-Data` + `users.approved`；群里 deep link 还得验 `account.telegram_user_id === current user`。Cron 用 `reply_parameters` thread 在原邮件下面。
