import { t } from "elysia";

// ─── Mail list / search ─────────────────────────────────────────────────────

export const MailListType = t.Union([
  t.Literal("unread"),
  t.Literal("starred"),
  t.Literal("junk"),
  t.Literal("archived"),
]);
export type MailListType = typeof MailListType.static;

export const MailListItem = t.Object({
  id: t.String(),
  title: t.Union([t.String(), t.Null()]),
  token: t.String(),
  tgChatId: t.Optional(t.String()),
  tgMessageId: t.Optional(t.Number()),
  from: t.Optional(t.String()),
});

export const MailListAccountResult = t.Object({
  accountId: t.Number(),
  accountEmail: t.Union([t.String(), t.Null()]),
  items: t.Array(MailListItem),
  total: t.Number(),
  error: t.Optional(t.String()),
});

export const MailListResponse = t.Object({
  type: MailListType,
  results: t.Array(MailListAccountResult),
  total: t.Number(),
});

export const MailSearchResponse = t.Object({
  query: t.String(),
  results: t.Array(MailListAccountResult),
  total: t.Number(),
});

export const BulkActionResponse = t.Object({
  success: t.Number(),
  failed: t.Number(),
});

// ─── Reminder enrich (shared with reminders module via @api/modules/reminders) ──

const ReminderBase = t.Object({
  id: t.Number(),
  telegram_user_id: t.String(),
  text: t.String(),
  remind_at: t.String(),
  account_id: t.Union([t.Number(), t.Null()]),
  email_message_id: t.Union([t.String(), t.Null()]),
  email_subject: t.Union([t.String(), t.Null()]),
  tg_chat_id: t.Union([t.String(), t.Null()]),
  tg_message_id: t.Union([t.Number(), t.Null()]),
  sent_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export const Reminder = t.Composite([
  ReminderBase,
  t.Object({
    mail_token: t.Optional(t.Union([t.String(), t.Null()])),
    email_summary: t.Optional(t.Union([t.String(), t.Null()])),
  }),
]);
export type Reminder = typeof Reminder.static;
