import { authMiniApp } from "@worker/api/plugins/auth-miniapp";
import { cf } from "@worker/api/plugins/cf";
import { deleteThingsAppInstanceId } from "@worker/db/kv";
import {
  clearUserThingsSettings,
  getUserByTelegramId,
  updateUserThingsSettings,
} from "@worker/db/users";
import type { TelegramUser } from "@worker/types";
import { Elysia } from "elysia";
import { ThingsSettingsBody } from "./model";

function normalizeText(value: string | undefined): string {
  return value?.trim() ?? "";
}

function thingsSettingsResponse(user: TelegramUser) {
  const email = user.things_cloud_email?.trim() || null;
  return {
    enabled: Boolean(email && user.things_cloud_password),
    email,
    user_timezone: user.user_timezone?.trim() || null,
    hasPassword: Boolean(user.things_cloud_password),
  };
}

export const settingsController = new Elysia({
  name: "controller.settings",
})
  .use(cf)
  .use(authMiniApp)

  .get("/api/settings/things", async ({ env, userId, status }) => {
    const user = await getUserByTelegramId(env.DB, userId);
    if (!user) return status(404, { error: "用户不存在" });
    return thingsSettingsResponse(user);
  })

  .put(
    "/api/settings/things",
    async ({ env, userId, body, status }) => {
      const user = await getUserByTelegramId(env.DB, userId);
      if (!user) return status(404, { error: "用户不存在" });

      const previousEmail = user.things_cloud_email?.trim() ?? "";
      const email =
        body.email === undefined ? previousEmail : normalizeText(body.email);
      if (!email) return status(400, { error: "缺少 Things Cloud 邮箱" });

      const password = normalizeText(body.password);
      const hasNewPassword = password.length > 0;
      const emailChanged = email !== previousEmail;
      if (!hasNewPassword && (!user.things_cloud_password || emailChanged)) {
        return status(400, { error: "请输入 Things Cloud 密码" });
      }

      await updateUserThingsSettings(env.DB, userId, {
        email,
        password: hasNewPassword ? password : undefined,
      });

      const updated = await getUserByTelegramId(env.DB, userId);
      if (!updated) return status(404, { error: "用户不存在" });
      return thingsSettingsResponse(updated);
    },
    { body: ThingsSettingsBody },
  )

  .delete("/api/settings/things", async ({ env, userId }) => {
    await Promise.all([
      clearUserThingsSettings(env.DB, userId),
      deleteThingsAppInstanceId(env.EMAIL_KV, userId),
    ]);
    return { ok: true };
  });
