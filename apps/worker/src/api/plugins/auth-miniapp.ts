import { getUserByTelegramId, updateUserTimezone } from "@worker/db/users";
import type { Env, TelegramUser } from "@worker/types";
import { verifyTgInitData } from "@worker/utils/auth";
import { reportErrorToObservability } from "@worker/utils/observability";
import { normalizeIanaTimeZone } from "@worker/utils/time-zone";
import { Elysia } from "elysia";
import { cf } from "./cf";

const updateUserTimezoneIfChanged = async (
  env: Env,
  user: TelegramUser,
  userTimezone: string | null,
): Promise<void> => {
  if (!userTimezone || user.user_timezone === userTimezone) return;
  try {
    await updateUserTimezone(env.DB, user.telegram_id, userTimezone);
  } catch (err) {
    await reportErrorToObservability(
      env,
      "miniapp.user_timezone_update_failed",
      err,
      {
        telegramUserId: user.telegram_id,
      },
    );
  }
};
/**
 * Mini App 鉴权：X-Telegram-Init-Data 头验签 + users.approved 检查（管理员豁免）。
 * 失败返回 401 JSON。通过则在 context 里挂 `userId` + `isAdmin`。
 */
export const authMiniApp = new Elysia({ name: "auth-miniapp" })
  .use(cf)
  .derive({ as: "scoped" }, async ({ env, headers, status }) => {
    const initData = headers["x-telegram-init-data"];
    if (!initData) return status(401, { error: "Unauthorized" });

    const tgUser = await verifyTgInitData(env.TELEGRAM_BOT_TOKEN, initData);
    if (!tgUser) return status(401, { error: "Unauthorized" });

    const telegramId = String(tgUser.id);
    const userTimezone = normalizeIanaTimeZone(
      headers["x-telemail-user-time-zone"],
    );
    const isAdmin = telegramId === env.ADMIN_TELEGRAM_ID;
    if (isAdmin) {
      const dbUser = await getUserByTelegramId(env.DB, telegramId);
      if (dbUser) await updateUserTimezoneIfChanged(env, dbUser, userTimezone);
      return { userId: telegramId, isAdmin };
    }

    const dbUser = await getUserByTelegramId(env.DB, telegramId);
    if (dbUser?.approved !== 1) {
      return status(401, { error: "Unauthorized" });
    }
    await updateUserTimezoneIfChanged(env, dbUser, userTimezone);
    return { userId: telegramId, isAdmin };
  });
