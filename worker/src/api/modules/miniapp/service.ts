/** Miniapp 模块业务编排：list / search 两个 use-case。bot 的 mail-list
 *  rendering 也复用这层 —— bot 直接 `MiniappService.getMailList(...)`。 */
import { getOwnAccounts } from "@worker/db/accounts";
import { getMappingsByEmailIds } from "@worker/db/message-map";
import { getEmailProvider } from "@worker/providers";
import type { Env } from "@worker/types";
import { generateMailTokenById } from "@worker/utils/mail-token";
import { reportErrorToObservability } from "@worker/utils/observability";
import type { MailListItem, MailListType } from "./model";
import type { MailListResult, MailSearchResult } from "./types";
import { LIST_DEFS, MAX_PER_ACCOUNT } from "./utils";

export abstract class MiniappService {
  /** 拉取 user 所有启用账号的邮件列表 + 生成共享访问 token + 收集副作用。
   *  miniapp `/api/mini-app/list/:type` 与 bot `mail-list` 双消费。 */
  static async getMailList(
    env: Env,
    userId: string,
    type: MailListType,
  ): Promise<MailListResult> {
    const def = LIST_DEFS[type];
    const accounts = (await getOwnAccounts(env.DB, userId)).filter(
      (a) => !a.disabled,
    );

    const pendingSideEffects: (() => Promise<void>)[] = [];

    const results = await Promise.all(
      accounts.map(async (account) => {
        try {
          const provider = getEmailProvider(account, env);
          const msgs = await def.fetcher(provider);
          if (msgs.length === 0)
            return {
              accountId: account.id,
              accountEmail: account.email,
              items: [],
              total: 0,
            };

          const mappings = await getMappingsByEmailIds(
            env.DB,
            account.id,
            msgs.map((m) => m.id),
          );
          const mappingMap = new Map(
            mappings.map((m) => [m.email_message_id, m]),
          );

          const items: MailListItem[] = await Promise.all(
            msgs.map(async (msg) => {
              const mapping = mappingMap.get(msg.id);
              return {
                id: msg.id,
                title: mapping?.short_summary || msg.subject || null,
                token: await generateMailTokenById(
                  env.ADMIN_SECRET,
                  msg.id,
                  account.id,
                ),
                tgChatId: !def.hideTgLinks ? mapping?.tg_chat_id : undefined,
                tgMessageId: !def.hideTgLinks
                  ? mapping?.tg_message_id
                  : undefined,
              };
            }),
          );

          if (def.afterMappings && mappings.length > 0) {
            const _mappings = mappings;
            const _account = account;
            const _after = def.afterMappings;
            pendingSideEffects.push(() => _after(env, _mappings, _account));
          }

          return {
            accountId: account.id,
            accountEmail: account.email,
            items,
            total: msgs.length,
          };
        } catch (err) {
          await reportErrorToObservability(env, def.errorEvent, err, {
            accountId: account.id,
          });
          return {
            accountId: account.id,
            accountEmail: account.email,
            items: [],
            total: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    const total = results.reduce((sum, r) => sum + r.total, 0);
    return { type, results, total, pendingSideEffects };
  }

  /** 跨该用户所有启用账号搜索邮件（Mini App 🔍 入口）。结果形状跟 `getMailList`
   *  几乎一致，但搜索是只读的所以无副作用。 */
  static async searchMail(
    env: Env,
    userId: string,
    query: string,
  ): Promise<MailSearchResult> {
    const trimmed = query.trim();
    const accounts = (await getOwnAccounts(env.DB, userId)).filter(
      (a) => !a.disabled,
    );

    const results = await Promise.all(
      accounts.map(async (account) => {
        try {
          const provider = getEmailProvider(account, env);
          const msgs = await provider.searchMessages(trimmed, MAX_PER_ACCOUNT);
          if (msgs.length === 0)
            return {
              accountId: account.id,
              accountEmail: account.email,
              items: [],
              total: 0,
            };

          const mappings = await getMappingsByEmailIds(
            env.DB,
            account.id,
            msgs.map((m) => m.id),
          );
          const mappingMap = new Map(
            mappings.map((m) => [m.email_message_id, m]),
          );

          const items: MailListItem[] = await Promise.all(
            msgs.map(async (msg) => {
              const mapping = mappingMap.get(msg.id);
              return {
                id: msg.id,
                title: mapping?.short_summary || msg.subject || null,
                token: await generateMailTokenById(
                  env.ADMIN_SECRET,
                  msg.id,
                  account.id,
                ),
                tgChatId: mapping?.tg_chat_id,
                tgMessageId: mapping?.tg_message_id,
                from: msg.from,
              };
            }),
          );

          return {
            accountId: account.id,
            accountEmail: account.email,
            items,
            total: msgs.length,
          };
        } catch (err) {
          await reportErrorToObservability(env, "bot.search_failed", err, {
            accountId: account.id,
          });
          return {
            accountId: account.id,
            accountEmail: account.email,
            items: [],
            total: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    const total = results.reduce((sum, r) => sum + r.total, 0);
    return { query: trimmed, results, total };
  }
}
