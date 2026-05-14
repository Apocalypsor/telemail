import {
  accountDetailKeyboard,
  accountDetailText,
  accountListKeyboard,
  resolveAccount,
  resolveOwnerName,
} from "@worker/bot/utils/account";
import { isAdmin } from "@worker/bot/utils/auth";
import { clearBotState } from "@worker/bot/utils/input-state";
import {
  getAllAccounts,
  getOwnAccounts,
  getVisibleAccounts,
} from "@worker/db/accounts";
import { t } from "@worker/i18n";
import type { Env } from "@worker/types";
import type { Bot } from "grammy";
import { registerAddCallbacks } from "./add";
import { registerAuthCallbacks } from "./auth";
import { registerEditCallbacks } from "./edit";

/** 注册账号管理列表 + 详情回调，再分发到 auth/edit/add 子模块。 */
export const registerAccountHandlers = (bot: Bot, env: Env) => {
  // Account list (default: own accounts only)
  bot.callbackQuery("accs", async (ctx) => {
    const userId = String(ctx.from.id);
    await clearBotState(env, userId);
    const admin = isAdmin(userId, env);
    const accounts = admin
      ? await getOwnAccounts(env.DB, userId)
      : await getVisibleAccounts(env.DB, userId, false);

    const text =
      accounts.length > 0
        ? t("accounts:list.myAccounts", { count: accounts.length })
        : t("accounts:list.noAccounts");
    await ctx.editMessageText(text, {
      reply_markup: accountListKeyboard(accounts, {
        isAdmin: admin,
        showBack: true,
      }),
    });
    await ctx.answerCallbackQuery();
  });

  // Account list (admin: show all accounts, from menu)
  bot.callbackQuery("accs:all", async (ctx) => {
    const userId = String(ctx.from.id);
    await clearBotState(env, userId);
    if (!isAdmin(userId, env))
      return ctx.answerCallbackQuery({ text: t("common:error.unauthorized") });

    const accounts = await getAllAccounts(env.DB);
    const text = t("accounts:list.allAccounts", { count: accounts.length });
    await ctx.editMessageText(text, {
      reply_markup: accountListKeyboard(accounts, {
        isAdmin: true,
        showAll: true,
        showBack: true,
      }),
    });
    await ctx.answerCallbackQuery();
  });

  // Account detail
  bot.callbackQuery(/^acc:(\d+)$/, async (ctx) => {
    const { userId, admin, account } = await resolveAccount(
      env,
      ctx.from.id,
      ctx.match?.[1],
    );
    await clearBotState(env, userId);
    if (!account)
      return ctx.answerCallbackQuery({
        text: t("common:error.accountNotFound"),
      });

    const ownerName = await resolveOwnerName(
      env.DB,
      admin,
      account.telegram_user_id,
    );
    await ctx.editMessageText(accountDetailText(account, ownerName), {
      reply_markup: accountDetailKeyboard(account),
    });
    await ctx.answerCallbackQuery();
  });

  registerAuthCallbacks(bot, env);
  registerEditCallbacks(bot, env);
  registerAddCallbacks(bot, env);
};
