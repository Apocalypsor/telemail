import { t, type UnwrapSchema } from "elysia";

const Folder = t.Union([
  t.Literal("inbox"),
  t.Literal("junk"),
  t.Literal("archive"),
]);

export const ComposeReplySource = t.Object({
  emailMessageId: t.String({ minLength: 1, maxLength: 2048 }),
  token: t.String({ minLength: 1, maxLength: 256 }),
  folder: t.Optional(Folder),
});

export const ComposeSendBody = t.Object({
  accountId: t.Number(),
  to: t.String({ maxLength: 4096 }),
  subject: t.String({ maxLength: 998 }),
  body: t.String({ minLength: 1, maxLength: 100_000 }),
  replySource: t.Optional(ComposeReplySource),
});
export type ComposeSendBody = UnwrapSchema<typeof ComposeSendBody>;
