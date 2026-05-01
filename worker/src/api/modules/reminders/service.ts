/** Reminders 模块的业务用例编排。目前只有一项：list 接口的 enrich 流程
 *  （给 reminder 行附加 mail_token + email_summary）。 */
import { MailService } from "@worker/api/modules/mail/service";
import { getMappingsByEmailIds } from "@worker/db/message-map";
import type { Reminder } from "@worker/db/reminders";
import type { Env } from "@worker/types";
import type { EnrichedReminder } from "./types";

export abstract class RemindersService {
  /** 给 listOnly 模式（主菜单"我的提醒"）的 reminder 列表附加 mail_token + email_summary。
   *  按 (accountId, emailMessageId) 去重，HMAC + mapping 计算两路并发。 */
  static async enrich(
    env: Env,
    items: Reminder[],
  ): Promise<EnrichedReminder[]> {
    const uniq = new Map<
      string,
      { accountId: number; emailMessageId: string }
    >();
    for (const r of items) {
      if (r.account_id && r.email_message_id)
        uniq.set(`${r.account_id}:${r.email_message_id}`, {
          accountId: r.account_id,
          emailMessageId: r.email_message_id,
        });
    }

    const idsByAccount = new Map<number, string[]>();
    for (const { accountId, emailMessageId } of uniq.values()) {
      const arr = idsByAccount.get(accountId);
      if (arr) arr.push(emailMessageId);
      else idsByAccount.set(accountId, [emailMessageId]);
    }

    const tokenByKey = new Map<string, string>();
    const summaryByKey = new Map<string, string>();
    await Promise.all([
      ...Array.from(idsByAccount.entries()).map(async ([accountId, ids]) => {
        const mappings = await getMappingsByEmailIds(env.DB, accountId, ids);
        for (const m of mappings) {
          if (m.short_summary)
            summaryByKey.set(
              `${accountId}:${m.email_message_id}`,
              m.short_summary,
            );
        }
      }),
      ...Array.from(uniq.entries()).map(async ([key, v]) => {
        tokenByKey.set(
          key,
          await MailService.generateToken(
            env.ADMIN_SECRET,
            v.emailMessageId,
            v.accountId,
          ),
        );
      }),
    ]);

    return items.map((r) => {
      const key =
        r.account_id && r.email_message_id
          ? `${r.account_id}:${r.email_message_id}`
          : null;
      return {
        ...r,
        mail_token: key ? (tokenByKey.get(key) ?? null) : null,
        email_summary: key ? (summaryByKey.get(key) ?? null) : null,
      };
    });
  }
}
