import { t } from "elysia";

export const ReminderId = t.Object({ id: t.String() });

export const ResolveContextQuery = t.Object({
  start: t.Optional(t.String()),
});

export const ResolveContextResponse = t.Object({
  accountId: t.Number(),
  emailMessageId: t.String(),
  token: t.String(),
});

export const EmailContextQuery = t.Object({
  accountId: t.Optional(t.String()),
  emailMessageId: t.Optional(t.String()),
  token: t.Optional(t.String()),
});

export const EmailContextResponse = t.Object({
  subject: t.Union([t.String(), t.Null()]),
  accountEmail: t.Union([t.String(), t.Null()]),
  deliveredToChat: t.Union([t.String(), t.Null()]),
});

export const ListQuery = t.Object({
  accountId: t.Optional(t.String()),
  emailMessageId: t.Optional(t.String()),
  token: t.Optional(t.String()),
});

export const CreateBody = t.Object({
  text: t.Optional(t.String()),
  remind_at: t.Optional(t.String()),
  accountId: t.Optional(t.Number()),
  emailMessageId: t.Optional(t.String()),
  token: t.Optional(t.String()),
});

export const UpdateBody = t.Object({
  text: t.Optional(t.String()),
  remind_at: t.Optional(t.String()),
});
