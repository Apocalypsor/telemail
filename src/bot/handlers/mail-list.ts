import { getOwnAccounts } from "@db/accounts";
import { getMappingsByEmailIds, type MessageMapping } from "@db/message-map";
import {
  type EmailListItem,
  type EmailProvider,
  getEmailProvider,
} from "@services/email/provider";
import {
  deleteJunkMappings,
  markAllAsRead,
  syncStarButtonsForMappings,
  trashAllJunkEmails,
} from "@services/message-actions";
import { buildTgMessageLink } from "@services/telegram";
import { buildMailPreviewUrl } from "@utils/hash";
import { escapeMdV2 } from "@utils/markdown-v2";
import { reportErrorToObservability } from "@utils/observability";
import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { Account, Env } from "@/types";

const MAX_PER_ACCOUNT = 20;

/** 生成邮件 web 预览链接 */
async function buildPreviewLink(
  env: Env,
  emailId: string,
  accountId: number,
): Promise<string | undefined> {
  if (!env.WORKER_URL) return undefined;
  return buildMailPreviewUrl(
    env.WORKER_URL,
    env.ADMIN_SECRET,
    emailId,
    accountId,
  );
}

interface ListItem {
  subject?: string;
  tgLink?: string;
  previewLink?: string;
}

interface ListResult {
  account: Account;
  items: ListItem[];
  total: number;
  error?: string;
}

interface ListConfig {
  icon: string;
  label: string;
  emptyText: string;
  errorEvent: string;
}

/** 查询单个账号的邮件列表，同时生成 TG 深链接和 web 预览链接 */
async function queryAccount(
  env: Env,
  account: Account,
  fetcher: (provider: EmailProvider) => Promise<EmailListItem[]>,
  errorEvent: string,
  afterMappings?: (
    mappings: MessageMapping[],
    account: Account,
  ) => Promise<void>,
  hideTgLinks = false,
): Promise<ListResult> {
  try {
    const provider = getEmailProvider(account, env);
    const msgs = await fetcher(provider);
    if (msgs.length === 0) return { account, items: [], total: 0 };

    let mappingMap = new Map<string, MessageMapping>();
    const needMappings = !!afterMappings || !hideTgLinks;
    if (needMappings) {
      const mappings = await getMappingsByEmailIds(
        env.DB,
        account.id,
        msgs.map((m) => m.id),
      );
      if (afterMappings) await afterMappings(mappings, account);
      if (!hideTgLinks) {
        mappingMap = new Map(mappings.map((m) => [m.email_message_id, m]));
      }
    }

    const items = await Promise.all(
      msgs.map(async (msg) => {
        const mapping = mappingMap.get(msg.id);
        return {
          subject: msg.subject,
          tgLink: mapping
            ? buildTgMessageLink(mapping.tg_chat_id, mapping.tg_message_id)
            : undefined,
          previewLink: await buildPreviewLink(env, msg.id, account.id),
        };
      }),
    );

    return { account, items, total: msgs.length };
  } catch (err) {
    await reportErrorToObservability(env, errorEvent, err, {
      accountId: account.id,
    });
    return {
      account,
      items: [],
      total: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 构建邮件列表结果文本 */
async function buildListText(
  env: Env,
  userId: string,
  fetcher: (provider: EmailProvider) => Promise<EmailListItem[]>,
  config: ListConfig,
  afterMappings?: (
    mappings: MessageMapping[],
    account: Account,
  ) => Promise<void>,
  hideTgLinks = false,
): Promise<{ text: string; hasItems: boolean }> {
  const accounts = await getOwnAccounts(env.DB, userId);
  if (accounts.length === 0)
    return { text: "📭 暂无绑定的邮箱账号", hasItems: false };

  const results = await Promise.all(
    accounts.map((acc) =>
      queryAccount(
        env,
        acc,
        fetcher,
        config.errorEvent,
        afterMappings,
        hideTgLinks,
      ),
    ),
  );

  const lines: string[] = [];
  let total = 0;

  for (const r of results) {
    const accountLabel = escapeMdV2(
      r.account.email || `Account #${r.account.id}`,
    );
    if (r.error) {
      lines.push(`❌ ${accountLabel}: 查询失败`);
      continue;
    }
    if (r.total === 0) continue;

    total += r.total;
    lines.push(`\n📧 ${accountLabel} \\(${r.total} 封${config.label}\\)`);
    for (const [i, item] of r.items.entries()) {
      const title = escapeMdV2(item.subject || "(无主题)");
      const linkParts: string[] = [];
      if (item.tgLink) linkParts.push(`[💬 消息](${item.tgLink})`);
      if (item.previewLink) linkParts.push(`[👁 预览](${item.previewLink})`);
      const linksStr = linkParts.length > 0 ? `  ${linkParts.join("  ")}` : "";
      lines.push(`  ${i + 1}\\. ${title}${linksStr}`);
    }
  }

  if (total === 0) return { text: config.emptyText, hasItems: false };

  return {
    text: `${config.icon} 共 ${total} 封${config.label}\n${lines.join("\n")}`,
    hasItems: true,
  };
}

/* ------------------------------------------------------------------ */
/*  通用注册：每种邮件列表只需一份定义                                   */
/* ------------------------------------------------------------------ */

interface ListDef {
  name: string;
  fetcher: (p: EmailProvider) => Promise<EmailListItem[]>;
  config: ListConfig;
  afterMappings?: (
    mappings: MessageMapping[],
    account: Account,
  ) => Promise<void>;
  /** 隐藏 TG 消息链接（如 junk 列表，TG 消息已被自动删除） */
  hideTgLinks?: boolean;
  actionKeyboard?: InlineKeyboard;
  action?: {
    callbackName: string;
    loadingText: string;
    handler: (
      env: Env,
      userId: string,
    ) => Promise<{ success: number; failed: number }>;
    resultText: (success: number, failed: number) => string;
  };
}

function registerList(bot: Bot, env: Env, def: ListDef) {
  const replyMarkupOpt = (hasItems: boolean) =>
    hasItems && def.actionKeyboard ? { reply_markup: def.actionKeyboard } : {};

  const queryList = (userId: string) =>
    buildListText(
      env,
      userId,
      def.fetcher,
      def.config,
      def.afterMappings,
      def.hideTgLinks,
    );

  bot.command(def.name, async (ctx) => {
    const userId = String(ctx.from?.id);
    const msg = await ctx.reply(`🔍 正在查询${def.config.label}邮件…`);
    const { text, hasItems } = await queryList(userId);
    await ctx.api.editMessageText(msg.chat.id, msg.message_id, text, {
      parse_mode: "MarkdownV2",
      link_preview_options: { is_disabled: true },
      ...replyMarkupOpt(hasItems),
    });
  });

  bot.callbackQuery(def.name, async (ctx) => {
    const userId = String(ctx.from.id);
    await ctx.answerCallbackQuery({ text: "正在查询…" });
    const { text, hasItems } = await queryList(userId);
    await ctx.reply(text, {
      parse_mode: "MarkdownV2",
      link_preview_options: { is_disabled: true },
      ...replyMarkupOpt(hasItems),
    });
  });

  if (def.action) {
    const { callbackName, loadingText, handler, resultText } = def.action;
    bot.callbackQuery(callbackName, async (ctx) => {
      const userId = String(ctx.from.id);
      await ctx.answerCallbackQuery({ text: loadingText });
      const { success, failed } = await handler(env, userId);
      await ctx.editMessageText(resultText(success, failed));
    });
  }
}

export function registerMailListHandlers(bot: Bot, env: Env) {
  registerList(bot, env, {
    name: "unread",
    fetcher: (p) => p.listUnread(MAX_PER_ACCOUNT),
    config: {
      icon: "📬",
      label: "未读",
      emptyText: "✅ 所有邮箱都没有未读邮件",
      errorEvent: "bot.unread_query_failed",
    },
    actionKeyboard: new InlineKeyboard().text(
      "✉️ 标记全部已读",
      "mark_all_read",
    ),
    action: {
      callbackName: "mark_all_read",
      loadingText: "正在标记…",
      handler: markAllAsRead,
      resultText: (s, f) =>
        f > 0 ? `✅ 已标记 ${s} 封已读，${f} 封失败` : `✅ 已标记 ${s} 封已读`,
    },
  });

  registerList(bot, env, {
    name: "starred",
    fetcher: (p) => p.listStarred(MAX_PER_ACCOUNT),
    config: {
      icon: "⭐",
      label: "星标",
      emptyText: "✅ 没有星标邮件",
      errorEvent: "bot.starred_query_failed",
    },
    afterMappings: (mappings, account) =>
      syncStarButtonsForMappings(env, mappings, account),
  });

  registerList(bot, env, {
    name: "junk",
    fetcher: (p) => p.listJunk(MAX_PER_ACCOUNT),
    config: {
      icon: "🚫",
      label: "垃圾",
      emptyText: "✅ 没有垃圾邮件",
      errorEvent: "bot.junk_query_failed",
    },
    afterMappings: (mappings, account) =>
      deleteJunkMappings(env, mappings, account),
    hideTgLinks: true,
    actionKeyboard: new InlineKeyboard().text("🗑 全部删除", "delete_all_junk"),
    action: {
      callbackName: "delete_all_junk",
      loadingText: "正在删除…",
      handler: trashAllJunkEmails,
      resultText: (s, f) =>
        f > 0
          ? `🗑 已删除 ${s} 封垃圾邮件，${f} 个账号失败`
          : `🗑 已删除 ${s} 封垃圾邮件`,
    },
  });
}
