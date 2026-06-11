import {
  ROUTE_MINI_APP_ACCOUNTS,
  ROUTE_MINI_APP_LIST,
  ROUTE_MINI_APP_REMINDERS,
  ROUTE_MINI_APP_SEARCH,
} from "@page/paths";
import { helpText } from "@worker/bot/commands";
import { isAdmin } from "@worker/bot/utils/auth";
import {
  onboardForumGroupIfNeeded,
  threadReplyOptions,
} from "@worker/bot/utils/forum-onboarding";
import { groupMiniAppUrl } from "@worker/bot/utils/miniapp-menu";
import {
  approveUser,
  getUserByTelegramId,
  rejectUser,
  upsertUser,
} from "@worker/db/users";
import { t } from "@worker/i18n";
import type { Env } from "@worker/types";
import { reportErrorToObservability } from "@worker/utils/observability";
import { getWorkerBaseUrl } from "@worker/utils/url";
import { formatUserName } from "@worker/utils/user-format";
import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";

export const registerStartHandlers = (
  bot: Bot,
  env: Env,
  botUsername: string,
) => {
  // ─── /start: 主入口，自动注册用户（私聊由全局守卫保证） ──────────────────
  bot.command("start", async (ctx) => {
    const telegramId = String(ctx.from?.id);
    const admin = isAdmin(telegramId, env);
    let user = await getUserByTelegramId(env.DB, telegramId);

    if (!user) {
      await upsertUser(
        env.DB,
        telegramId,
        ctx.from?.first_name || "Unknown",
        ctx.from?.last_name,
        ctx.from?.username,
        undefined,
        admin ? 1 : 0,
      );
      user = await getUserByTelegramId(env.DB, telegramId);

      if (!admin) {
        const displayName = formatUserName({
          first_name: ctx.from?.first_name || "Unknown",
          last_name: ctx.from?.last_name,
        });
        const username = ctx.from?.username ? ` (@${ctx.from.username})` : "";
        try {
          const kb = new InlineKeyboard()
            .text(t("start:approve"), `approve:${telegramId}`)
            .text(t("start:reject"), `reject:${telegramId}`);
          await ctx.api.sendMessage(
            env.ADMIN_TELEGRAM_ID,
            t("start:newUser", {
              name: `${displayName}${username}`,
              id: telegramId,
            }),
            {
              reply_markup: kb,
            },
          );
        } catch (err) {
          await reportErrorToObservability(env, "bot.notify_admin_failed", err);
        }
      }
    }

    if (!admin && user && user.approved !== 1) {
      return ctx.reply(t("common:admin.awaitingApprovalFull"));
    }

    const groupOnboarding = await onboardForumGroupIfNeeded(ctx, env);
    const text = groupOnboarding
      ? `${groupOnboarding}\n\n${t("start:panel")}`
      : t("start:panel");
    return ctx.reply(text, {
      ...threadReplyOptions(ctx.message?.message_thread_id),
      reply_markup: mainMenuKeyboard(admin, env, ctx.chat?.type, botUsername),
    });
  });

  // ─── /help ────────────────────────────────────────────────────────────────
  bot.command("help", async (ctx) => {
    return ctx.reply(helpText(), { parse_mode: "MarkdownV2" });
  });

  // ─── Main menu callback ──────────────────────────────────────────────────
  bot.callbackQuery("menu", async (ctx) => {
    const userId = String(ctx.from.id);
    const admin = isAdmin(userId, env);
    await ctx.editMessageText(t("start:panel"), {
      reply_markup: mainMenuKeyboard(admin, env, ctx.chat?.type, botUsername),
    });
    await ctx.answerCallbackQuery();
  });

  // ─── 管理员审批 inline 按钮回调 ──────────────────────────────────────────
  bot.callbackQuery(/^(approve|reject):(\d+)$/, async (ctx) => {
    if (!isAdmin(String(ctx.from.id), env)) {
      return ctx.answerCallbackQuery({ text: t("common:error.unauthorized") });
    }
    const [, action, targetId] = ctx.match as RegExpMatchArray;
    const user = await getUserByTelegramId(env.DB, targetId);
    if (!user) {
      return ctx.answerCallbackQuery({
        text: t("common:error.userNotFound"),
      });
    }

    if (action === "approve") {
      await approveUser(env.DB, targetId);
      await ctx.editMessageText(
        t("start:approved", { name: formatUserName(user), id: targetId }),
      );
      try {
        await ctx.api.sendMessage(targetId, t("start:approvedNotify"));
      } catch {
        /* user may have blocked bot */
      }
    } else {
      await rejectUser(env.DB, targetId);
      await ctx.editMessageText(
        t("start:rejected", { name: formatUserName(user), id: targetId }),
      );
      try {
        await ctx.api.sendMessage(targetId, t("start:rejectedNotify"));
      } catch {
        /* user may have blocked bot */
      }
    }
    return ctx.answerCallbackQuery();
  });
};

/** 主菜单键盘：邮件列表 + 提醒 Mini App 入口 + 账号/全局管理。 */
const mainMenuKeyboard = (
  admin: boolean,
  env: Env,
  chatType: "private" | "group" | "supergroup" | "channel" | undefined,
  botUsername: string,
): InlineKeyboard => {
  const kb = new InlineKeyboard();
  const base = getWorkerBaseUrl(env);
  const listUrl = (type: string) =>
    `${base}${ROUTE_MINI_APP_LIST.replace(":type", type)}`;
  const miniAppUrl = groupMiniAppUrl(env, botUsername);
  const appButton = (label: string, url: string, startParam: string): void => {
    if (chatType === "private") {
      kb.webApp(label, url);
      return;
    }
    kb.url(label, miniAppUrl(startParam, url));
  };
  appButton(t("keyboards:menu.unread"), listUrl("unread"), "p_list_unread");
  appButton(t("keyboards:menu.starred"), listUrl("starred"), "p_list_starred");
  kb.row();
  appButton(t("keyboards:menu.junk"), listUrl("junk"), "p_list_junk");
  appButton(
    t("keyboards:menu.archived"),
    listUrl("archived"),
    "p_list_archived",
  );
  kb.row();
  appButton(
    t("keyboards:menu.reminders"),
    `${base}${ROUTE_MINI_APP_REMINDERS}`,
    "p_reminders",
  );
  appButton(
    t("keyboards:menu.search"),
    `${base}${ROUTE_MINI_APP_SEARCH}`,
    "p_search",
  );
  kb.row();
  appButton(
    t("keyboards:menu.accountManagement"),
    `${base}${ROUTE_MINI_APP_ACCOUNTS}`,
    "p_accounts",
  );
  kb.text(t("keyboards:menu.sync"), "sync").row();
  if (admin) {
    kb.text(t("keyboards:menu.globalOps"), "admin").row();
  }
  return kb;
};
