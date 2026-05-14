import { t, type UnwrapSchema } from "elysia";

export const AccountIdParams = t.Object({ id: t.String() });

export const AccountListQuery = t.Object({
  scope: t.Optional(t.Union([t.Literal("own"), t.Literal("all")])),
});
export type AccountListQuery = UnwrapSchema<typeof AccountListQuery>;

const ChatId = t.String({ minLength: 1, maxLength: 64 });

export const CreateOAuthAccountBody = t.Object({
  type: t.Union([t.Literal("gmail"), t.Literal("outlook")]),
  chatId: ChatId,
});
export type CreateOAuthAccountBody = UnwrapSchema<
  typeof CreateOAuthAccountBody
>;

export const CreateImapAccountBody = t.Object({
  chatId: ChatId,
  imapHost: t.String({ minLength: 1, maxLength: 255 }),
  imapPort: t.Number(),
  imapSecure: t.Boolean(),
  imapUser: t.String({ minLength: 1, maxLength: 320 }),
  imapPass: t.String({ minLength: 1, maxLength: 2048 }),
});
export type CreateImapAccountBody = UnwrapSchema<typeof CreateImapAccountBody>;

export const UpdateChatIdBody = t.Object({ chatId: ChatId });
export type UpdateChatIdBody = UnwrapSchema<typeof UpdateChatIdBody>;

export const ToggleDisabledBody = t.Object({ disabled: t.Boolean() });
export type ToggleDisabledBody = UnwrapSchema<typeof ToggleDisabledBody>;

export const AssignOwnerBody = t.Object({
  telegramUserId: t.String({ minLength: 1, maxLength: 64 }),
});
export type AssignOwnerBody = UnwrapSchema<typeof AssignOwnerBody>;

export const ArchiveLabelBody = t.Object({
  labelId: t.Union([t.String({ minLength: 1, maxLength: 512 }), t.Null()]),
});
export type ArchiveLabelBody = UnwrapSchema<typeof ArchiveLabelBody>;

export const AccountTypeModel = t.Union([
  t.Literal("gmail"),
  t.Literal("outlook"),
  t.Literal("imap"),
]);

export const AccountResponse = t.Object({
  id: t.Number(),
  type: AccountTypeModel,
  typeName: t.String(),
  email: t.Union([t.String(), t.Null()]),
  chatId: t.String(),
  disabled: t.Boolean(),
  authorized: t.Boolean(),
  oauth: t.Boolean(),
  oauthProviderName: t.Union([t.String(), t.Null()]),
  needsArchiveSetup: t.Boolean(),
  canArchive: t.Boolean(),
  archiveFolder: t.Union([t.String(), t.Null()]),
  archiveFolderName: t.Union([t.String(), t.Null()]),
  ownerTelegramId: t.Union([t.String(), t.Null()]),
  ownerName: t.Union([t.String(), t.Null()]),
  imapHost: t.Union([t.String(), t.Null()]),
  imapPort: t.Union([t.Number(), t.Null()]),
  imapSecure: t.Boolean(),
  imapUser: t.Union([t.String(), t.Null()]),
});
export type AccountResponse = UnwrapSchema<typeof AccountResponse>;

export const AccountProviderOption = t.Object({
  type: AccountTypeModel,
  displayName: t.String(),
  oauth: t.Boolean(),
  oauthProviderName: t.Union([t.String(), t.Null()]),
  configured: t.Boolean(),
  needsArchiveSetup: t.Boolean(),
});
export type AccountProviderOption = UnwrapSchema<typeof AccountProviderOption>;

export const AccountUserOption = t.Object({
  telegramId: t.String(),
  label: t.String(),
  username: t.Union([t.String(), t.Null()]),
});
export type AccountUserOption = UnwrapSchema<typeof AccountUserOption>;

export const AccountListResponse = t.Object({
  accounts: t.Array(AccountResponse),
  providers: t.Array(AccountProviderOption),
  users: t.Array(AccountUserOption),
  canViewAll: t.Boolean(),
  scope: t.Union([t.Literal("own"), t.Literal("all")]),
  currentUserId: t.String(),
});
export type AccountListResponse = UnwrapSchema<typeof AccountListResponse>;

export const AccountDetailResponse = t.Object({
  account: AccountResponse,
  users: t.Array(AccountUserOption),
  canViewAll: t.Boolean(),
  currentUserId: t.String(),
});
export type AccountDetailResponse = UnwrapSchema<typeof AccountDetailResponse>;

export const AccountMutationResponse = t.Object({
  account: AccountResponse,
});
export type AccountMutationResponse = UnwrapSchema<
  typeof AccountMutationResponse
>;

export const CreateOAuthAccountResponse = t.Object({
  account: AccountResponse,
  oauthUrl: t.String(),
});
export type CreateOAuthAccountResponse = UnwrapSchema<
  typeof CreateOAuthAccountResponse
>;

export const ArchiveLabelOption = t.Object({
  id: t.String(),
  name: t.String(),
});
export type ArchiveLabelOption = UnwrapSchema<typeof ArchiveLabelOption>;
