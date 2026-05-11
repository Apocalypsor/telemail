import type { TelegramUser } from "@worker/types";
import type { ThingsSettingsResponse } from "./model";

export const normalizeText = (value: string | undefined): string => {
  return value?.trim() ?? "";
};

export const buildThingsSettingsResponse = (
  user: TelegramUser,
): ThingsSettingsResponse => {
  const email = user.things_cloud_email?.trim() || null;
  return {
    enabled: Boolean(email && user.things_cloud_password),
    email,
    user_timezone: user.user_timezone?.trim() || null,
    hasPassword: Boolean(user.things_cloud_password),
  };
};
