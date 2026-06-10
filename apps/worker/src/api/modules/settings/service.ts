import { deleteThingsAppInstanceId } from "@worker/db/kv";
import {
  clearUserThingsSettings,
  getUserByTelegramId,
  updateUserThingsSettings,
} from "@worker/db/users";
import type { Env } from "@worker/types";
import type { ThingsSettingsBody } from "./model";
import type { ThingsSettingsResult, UpdateThingsSettingsResult } from "./types";
import { buildThingsSettingsResponse, normalizeText } from "./utils";

export abstract class SettingsService {
  static async getThingsSettings(
    env: Env,
    userId: string,
  ): Promise<ThingsSettingsResult> {
    const user = await getUserByTelegramId(env.DB, userId);
    if (!user) return { ok: false, status: 404, error: "用户不存在" };
    return { ok: true, data: buildThingsSettingsResponse(user) };
  }

  static async updateThingsSettings(
    env: Env,
    userId: string,
    body: ThingsSettingsBody,
  ): Promise<UpdateThingsSettingsResult> {
    const user = await getUserByTelegramId(env.DB, userId);
    if (!user) return { ok: false, status: 404, error: "用户不存在" };

    const previousEmail = user.things_cloud_email?.trim() ?? "";
    const email =
      body.email === undefined ? previousEmail : normalizeText(body.email);
    if (!email)
      return { ok: false, status: 400, error: "缺少 Things Cloud 邮箱" };

    const password = normalizeText(body.password);
    const hasNewPassword = password.length > 0;
    const emailChanged = email !== previousEmail;
    if (!hasNewPassword && (!user.things_cloud_password || emailChanged)) {
      return { ok: false, status: 400, error: "请输入 Things Cloud 密码" };
    }

    await updateUserThingsSettings(env.DB, userId, {
      email,
      password: hasNewPassword ? password : undefined,
    });

    const updated = await getUserByTelegramId(env.DB, userId);
    if (!updated) return { ok: false, status: 404, error: "用户不存在" };
    return { ok: true, data: buildThingsSettingsResponse(updated) };
  }

  static async clearThingsSettings(env: Env, userId: string): Promise<void> {
    await Promise.all([
      clearUserThingsSettings(env.DB, userId),
      deleteThingsAppInstanceId(env.EMAIL_KV, userId),
    ]);
  }
}
