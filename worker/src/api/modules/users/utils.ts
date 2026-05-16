import type { TelegramUser } from "@worker/types";
import { formatUserName } from "@worker/utils/user-format";
import type { UserResponse } from "./model";

export const userToResponse = (
  user: TelegramUser,
  accountCount: number,
): UserResponse => ({
  telegramId: user.telegram_id,
  name: formatUserName(user),
  username: user.username,
  approved: user.approved === 1,
  lastLoginAt: user.last_login_at?.toISOString() ?? null,
  accountCount,
});
