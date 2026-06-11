import type { Env } from "@worker/types";

export const groupMiniAppUrl =
  (env: Env, botUsername: string) =>
  (startParam: string, fallbackUrl: string): string => {
    if (!env.TG_MINI_APP_SHORT_NAME) return fallbackUrl;
    return `https://t.me/${botUsername}/${env.TG_MINI_APP_SHORT_NAME}?startapp=${startParam}`;
  };
