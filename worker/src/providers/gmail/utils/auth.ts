import { GOOGLE_OAUTH_TOKEN_URL } from "@worker/constants";
import { refreshAccessToken } from "@worker/providers/utils";
import type { Account, Env } from "@worker/types";

/** 用 refresh_token 换 access_token（KV 缓存，共用 base.ts 的实现） */
export const getAccessToken = async (
  env: Env,
  account: Account,
): Promise<string> => {
  return refreshAccessToken(env, account, {
    tokenUrl: GOOGLE_OAUTH_TOKEN_URL,
    clientId: env.GMAIL_CLIENT_ID,
    clientSecret: env.GMAIL_CLIENT_SECRET,
  });
};
