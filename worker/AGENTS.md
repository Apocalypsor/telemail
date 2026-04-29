# Worker — Agent Guide

Cloudflare Worker (Hono). Cross-workspace rules in [root AGENTS.md](../AGENTS.md).

## Conventions

- **Layering**: `handlers/` only does routing / auth / req-resp shaping; business logic must live in `services/` or on a provider method. A long handler file means logic has leaked out.
- **Bot commands**: private chat only by default — `bot/index.ts` registers `registerPrivateOnlyCommandGuard` as a global guard (also covers `channel_post`). New commands don't need to re-check; `callback_query` is unaffected.
- **Email providers**: abstract class in `providers/base.ts`, barrel in `providers/index.ts`. **Never `branch on account.type` outside `providers/`** — per-provider differences live on the class (static metadata, instance methods, `static registerRoutes(app)`).
- **IMAP message id = RFC 822 Message-Id** (not the per-folder UID). The bridge takes `rfcMessageId` everywhere; UIDs aren't stable across folders. Emails without Message-Id are dropped. Gmail / Outlook keep their native ids.
- **Archive**: `provider.archiveMessage(id)` + `accountCanArchive(account)`. Gmail needs the user to pick a label (`accounts.archive_folder`); without one `canArchive()` returns false.
- **State reconciliation**: all "remote → TG" syncs go through `reconcileMessageState` (`services/message-actions.ts`). Star pin goes through `syncStarPinState`. **Don't** patch state in multiple places.
- **Disable/enable**: `accounts.disabled` pauses an account without deleting data. Enforcement points: `services/bridge.ts::processEmailMessage`, push renewal, mail-list, `/sync`, `getImapAccounts`.
- **Cron**: single `* * * * *` trigger. Reminders dispatch every minute; `getUTCMinutes() === 0` gates the hourly batch; midnight renews all push subscriptions.
- **Email keyboard**: `buildEmailKeyboard` requires `tgMessageId`, so the delivery flow is send naked → insert message_map → build keyboard → `setReplyMarkup`. **One code path** covers both private chat and groups.
- **Reminders**: the only entry is the ⏰ button on email messages. Auth: `X-Telegram-Init-Data` + `users.approved`; group deep-link also verifies `account.telegram_user_id === current user`. Cron sends with `reply_parameters` so reminders thread under the original email.
