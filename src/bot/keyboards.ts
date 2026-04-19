import { getAccountById } from "@db/accounts";
import { getMessageMapping } from "@db/message-map";
import { t } from "@i18n";
import { accountCanArchive, getEmailProvider } from "@providers";
import { generateMailTokenById } from "@services/mail-preview";
import { InlineKeyboard } from "grammy";
import type { Env } from "@/types";

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

/** 根据星标状态构建邮件消息键盘 */
export async function buildEmailKeyboard(
  env: Env,
  emailMessageId: string,
  accountId: number,
  starred: boolean,
  canArchive: boolean,
): Promise<InlineKeyboard> {
  const kb = addCoreButtons(new InlineKeyboard(), starred, canArchive);
  if (env.WORKER_URL) {
    const mailToken = await generateMailTokenById(
      env.ADMIN_SECRET,
      emailMessageId,
      accountId,
    );
    const mailUrl = `${env.WORKER_URL.replace(/\/$/, "")}/mail/${emailMessageId}?accountId=${accountId}&t=${mailToken}`;
    kb.row().url(t("keyboards:mail.viewOriginal"), mailUrl);
  }
  return kb;
}

/** 从邮件源查询当前星标状态后构建键盘（LLM 处理后编辑消息使用） */
export async function resolveStarredKeyboard(
  env: Env,
  chatId: string,
  tgMessageId: number,
  emailMessageId: string,
  accountId: number,
): Promise<InlineKeyboard> {
  const mapping = await getMessageMapping(env.DB, chatId, tgMessageId);
  if (!mapping)
    return buildEmailKeyboard(env, emailMessageId, accountId, false, false);
  const account = await getAccountById(env.DB, mapping.account_id);
  if (!account)
    return buildEmailKeyboard(env, emailMessageId, accountId, false, false);
  const provider = getEmailProvider(account, env);
  const starred = await provider.isStarred(emailMessageId);
  return buildEmailKeyboard(
    env,
    emailMessageId,
    accountId,
    starred,
    accountCanArchive(account),
  );
}

// ── 主菜单键盘 ──────────────────────────────────────────────────────────────

/** 主菜单键盘 */
export function mainMenuKeyboard(admin: boolean): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text(t("keyboards:menu.accountManagement"), "accs")
    .row()
    .text(t("keyboards:menu.unread"), "unread")
    .text(t("keyboards:menu.sync"), "sync")
    .row()
    .text(t("keyboards:menu.starred"), "starred")
    .text(t("keyboards:menu.junk"), "junk")
    .row()
    .text(t("keyboards:menu.archived"), "archived")
    .row();
  if (admin) {
    kb.text(t("keyboards:menu.userManagement"), "users")
      .text(t("keyboards:menu.globalOps"), "admin")
      .row();
  }
  return kb;
}
