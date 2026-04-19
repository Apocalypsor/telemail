import { getAccountById } from "@db/accounts";
import { verifyMailTokenById } from "@services/mail-preview";
import type { Context } from "hono";
import type { Account, AppEnv } from "@/types";

type MailActionBody = {
  accountId?: number;
  token?: string;
};

/**
 * 预览页 POST 邮件操作的公共入口：解析 body + 校验 token + 取 account。
 * 失败时返回 `Response`（调用方直接 return）；成功返回 `{ account, messageId }`。
 */
export async function resolveMailAction<
  B extends MailActionBody = MailActionBody,
>(
  c: Context<AppEnv>,
): Promise<
  | { ok: true; account: Account; messageId: string; body: B }
  | { ok: false; response: Response }
> {
  const messageId = c.req.param("id");
  const body = (await c.req.json()) as B;
  if (!messageId || !body.accountId || !body.token) {
    return {
      ok: false,
      response: c.json({ ok: false, error: "参数缺失" }, 400),
    };
  }
  const valid = await verifyMailTokenById(
    c.env.ADMIN_SECRET,
    messageId,
    body.accountId,
    body.token,
  );
  if (!valid) {
    return {
      ok: false,
      response: c.json({ ok: false, error: "无效的 token" }, 403),
    };
  }
  const account = await getAccountById(c.env.DB, body.accountId);
  if (!account) {
    return {
      ok: false,
      response: c.json({ ok: false, error: "账号未找到" }, 404),
    };
  }
  return { ok: true, account, messageId, body };
}
