import { t, type UnwrapSchema } from "elysia";

export const UserIdParams = t.Object({
  id: t.String({ minLength: 1, maxLength: 64 }),
});

export const UserResponse = t.Object({
  telegramId: t.String(),
  name: t.String(),
  username: t.Union([t.String(), t.Null()]),
  approved: t.Boolean(),
  lastLoginAt: t.Union([t.String(), t.Null()]),
  accountCount: t.Number(),
});
export type UserResponse = UnwrapSchema<typeof UserResponse>;

export const UserListResponse = t.Object({
  users: t.Array(UserResponse),
});
export type UserListResponse = UnwrapSchema<typeof UserListResponse>;
