import { MS_MAIL_SCOPE, MS_OAUTH_TOKEN_URL } from "@worker/constants";
import { refreshAccessToken } from "@worker/providers/utils";
import type { Account, Env } from "@worker/types";

/** 用 refresh_token 换 access_token（KV 缓存，共用 base.ts 的实现） */
export async function getAccessToken(
  env: Env,
  account: Account,
): Promise<string> {
  return refreshAccessToken(env, account, {
    tokenUrl: MS_OAUTH_TOKEN_URL,
    clientId: env.MS_CLIENT_ID as string,
    clientSecret: env.MS_CLIENT_SECRET as string,
    extraBody: { scope: MS_MAIL_SCOPE },
    errorLabel: "MS ",
  });
}
