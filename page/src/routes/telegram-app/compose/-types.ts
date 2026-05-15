import { type Static, Type as t } from "@sinclair/typebox";
import type { AccountResponse } from "@worker/api/modules/accounts/model";

export const ComposeFolderSchema = t.Union([
  t.Literal("inbox"),
  t.Literal("junk"),
  t.Literal("archive"),
]);
export type ComposeFolder = Static<typeof ComposeFolderSchema>;

export type ComposeAccountsData = {
  accounts: AccountResponse[];
  currentUserId: string;
  canViewAll: boolean;
};

export const ComposeSearchSchema = t.Object({
  accountId: t.Optional(t.Number()),
  to: t.Optional(t.String()),
  subject: t.Optional(t.String()),
  replyEmailMessageId: t.Optional(t.String()),
  token: t.Optional(t.String()),
  folder: t.Optional(ComposeFolderSchema),
  back: t.Optional(t.String()),
});

export type ComposeSearch = Static<typeof ComposeSearchSchema>;
