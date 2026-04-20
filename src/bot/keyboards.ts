import { getCachedBotInfo } from "@db/kv";
import {
  ROUTE_MINI_APP_MAIL,
  ROUTE_MINI_APP_REMINDERS,
} from "@handlers/hono/routes";
import { t } from "@i18n";
import { generateMailTokenById } from "@services/mail-preview";
import { InlineKeyboard } from "grammy";
import type { Env } from "@/types";

/** 从 KV 缓存读 bot username（webhook 第一次请求会写入；不应缺失） */
async function getCachedBotUsername(env: Env): Promise<string | null> {
  const raw = await getCachedBotInfo(env.EMAIL_KV);
  if (!raw) return null;
  try {
    const info = JSON.parse(raw) as { username?: string };
    return info.username ?? null;
  } catch {
    return null;
  }
}

// ── 邮件信息键盘（星标 / 查看原文）─────────────────────────────────────────

function addCoreButtons(
  kb: InlineKeyboard,
  starred: boolean,
  canArchive: boolean,
): InlineKeyboard {
  kb.text(
    t(starred ? "keyboards:mail.starred" : "keyboards:mail.star"),
    starred ? "unstar" : "star",
  );
  kb.text(t("keyboards:mail.junk"), "junk_mark");
  if (canArchive) kb.text(t("keyboards:mail.archive"), "archive");
  kb.text(t("keyboards:mail.refresh"), "refresh");
  return kb;
}

/**
 * 从已有 reply_markup 推断当前星标状态 —— 读星按钮的 callback_data：
 * "star" 表示当前未星标（按钮动作是加星），"unstar" 表示当前已星标。
 * 用于在非星标场景（如 junk_cancel 还原键盘）避免查远端 `isStarred()`。
 */
export function readStarredFromReplyMarkup(replyMarkup: unknown): boolean {
  if (!replyMarkup || typeof replyMarkup !== "object") return false;
  const rows = (replyMarkup as { inline_keyboard?: unknown }).inline_keyboard;
  if (!Array.isArray(rows)) return false;
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (const btn of row) {
      const data =
        btn && typeof btn === "object"
          ? (btn as { callback_data?: unknown }).callback_data
          : undefined;
      if (data === "unstar") return true;
      if (data === "star") return false;
    }
  }
  return false;
}

/**
 * 根据星标状态构建邮件消息键盘。
 *
 * ⏰ 提醒按钮的入口：
 * - 私聊：inline `web_app` 按钮直接打开 Mini App（带 accountId/messageId/token URL 参数）
 * - 群聊：inline `web_app` 在群里无效（BUTTON_TYPE_INVALID），改用 deep link
 *   `t.me/<bot>?startapp=<chatId>_<tgMsgId>` 跳到与 bot 的私聊里打开 Mini App，
 *   start_param 由 Mini App 调 resolve-context 接口换出 (accountId, messageId, token)。
 *   群聊场景需要 `tgMessageId`（消息 send 之后才知道）—— 投递初次构建键盘时
 *   传 undefined 即可（首次群聊消息不带 ⏰），后续 LLM 分析/refresh/star toggle
 *   走的 keyboard 重建路径都已知 tgMessageId，会补上 ⏰。
 */
export async function buildEmailKeyboard(
  env: Env,
  emailMessageId: string,
  accountId: number,
  starred: boolean,
  canArchive: boolean,
  chatId: string,
  tgMessageId?: number,
): Promise<InlineKeyboard> {
  const kb = addCoreButtons(new InlineKeyboard(), starred, canArchive);
  if (!env.WORKER_URL) return kb;

  const base = env.WORKER_URL.replace(/\/$/, "");
  const mailToken = await generateMailTokenById(
    env.ADMIN_SECRET,
    emailMessageId,
    accountId,
  );
  // 私聊：直接用 Mini App URL（web_app inline button 仅私聊有效）
  // 群聊：用 t.me/<bot>/<shortname>?startapp=<feature>_<chat>_<msg> deep link
  const isPrivateChat = !chatId.startsWith("-");
  const remindMiniUrl = `${base}${ROUTE_MINI_APP_REMINDERS}?accountId=${accountId}&messageId=${encodeURIComponent(emailMessageId)}&token=${mailToken}`;
  const mailMiniUrl = `${base}${ROUTE_MINI_APP_MAIL.replace(":id", encodeURIComponent(emailMessageId))}?accountId=${accountId}&t=${mailToken}`;

  if (isPrivateChat) {
    kb.row()
      .webApp(t("keyboards:mail.remind"), remindMiniUrl)
      .webApp(t("keyboards:mail.viewOriginal"), mailMiniUrl);
    return kb;
  }

  // 群聊：要走 BotFather 注册的具名 Mini App
  const shortName = env.TG_MINI_APP_SHORT_NAME;
  if (tgMessageId != null && shortName) {
    const username = await getCachedBotUsername(env);
    if (username) {
      // start_param: <feature>_<chatId>_<tgMsgId>，~20 字符，远低于 64 上限
      const remindParam = `r_${chatId}_${tgMessageId}`;
      const mailParam = `m_${chatId}_${tgMessageId}`;
      const remindUrl = `https://t.me/${username}/${shortName}?startapp=${remindParam}`;
      const mailUrl = `https://t.me/${username}/${shortName}?startapp=${mailParam}`;
      kb.row()
        .url(t("keyboards:mail.remind"), remindUrl)
        .url(t("keyboards:mail.viewOriginal"), mailUrl);
      return kb;
    }
  }
  // 群聊但 tgMessageId 未知 / 没缓存到 bot username / 没配 short_name：
  // 退回到 web 预览链接（浏览器打开），不放 ⏰
  const webMailUrl = `${base}/mail/${emailMessageId}?accountId=${accountId}&t=${mailToken}`;
  kb.row().url(t("keyboards:mail.viewOriginal"), webMailUrl);
  return kb;
}

// ── 主菜单键盘 ──────────────────────────────────────────────────────────────

/** 主菜单键盘 */
export function mainMenuKeyboard(admin: boolean, env: Env): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text(t("keyboards:menu.accountManagement"), "accs")
    .row()
    .text(t("keyboards:menu.unread"), "unread")
    .text(t("keyboards:menu.starred"), "starred")
    .row()
    .text(t("keyboards:menu.junk"), "junk")
    .text(t("keyboards:menu.archived"), "archived")
    .row()
    .text(t("keyboards:menu.sync"), "sync");
  // 提醒列表：web_app 直接打开 Mini App 的 list-only 模式（不带邮件上下文）。
  // /start 走私聊，inline web_app 在私聊里有效。
  if (env.WORKER_URL) {
    const remindersUrl = `${env.WORKER_URL.replace(/\/$/, "")}${ROUTE_MINI_APP_REMINDERS}`;
    kb.row().webApp(t("keyboards:menu.reminders"), remindersUrl);
  }
  kb.row();
  if (admin) {
    kb.text(t("keyboards:menu.userManagement"), "users")
      .text(t("keyboards:menu.globalOps"), "admin")
      .row();
  }
  return kb;
}
