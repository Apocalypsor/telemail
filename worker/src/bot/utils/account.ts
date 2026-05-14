import { isAdmin } from "@worker/bot/utils/auth";
import { formatUserName } from "@worker/bot/utils/user-format";
import { getAuthorizedAccount } from "@worker/db/accounts";
import { getUserByTelegramId } from "@worker/db/users";
import { t } from "@worker/i18n";
import { PROVIDERS } from "@worker/providers";
import type { Account, Env } from "@worker/types";
import { InlineKeyboard } from "grammy";

export { cleanupAndDeleteAccount } from "@worker/utils/accounts";

/**
 * 解析账号所有者名称用于详情页 owner 行：
 * - 非管理员 → 返回 undefined（不显示 owner 行）
 * - 管理员 + account 无绑定 user → 返回 ""（显示"(无)"）
 * - 管理员 + 能查到 user → 优先 @username，否则用 formatUserName
 */
export const resolveOwnerName = async (
  db: D1Database,
  admin: boolean,
  telegramUserId: string | null,
): Promise<string | undefined> => {
  if (!admin) return undefined;
  if (!telegramUserId) return "";
  const owner = await getUserByTelegramId(db, telegramUserId);
  return owner?.username
    ? `@${owner.username}`
    : formatUserName(owner ?? { first_name: telegramUserId });
};

export const resolveAccount = async (
  env: Env,
  fromId: number,
  accountIdStr: string,
) => {
  const userId = String(fromId);
  const accountId = parseInt(accountIdStr, 10);
  const admin = isAdmin(userId, env);
  const account = await getAuthorizedAccount(env.DB, accountId, userId, admin);
  return { userId, accountId, admin, account };
};

export const accountListKeyboard = (
  accounts: Account[],
  options?: { isAdmin?: boolean; showAll?: boolean; showBack?: boolean },
): InlineKeyboard => {
  const kb = new InlineKeyboard();
  for (const acc of accounts) {
    // 禁用 > 非 OAuth（IMAP 等，直接视为可用）> OAuth 授权状态
    const status = acc.disabled
      ? "⏸"
      : !PROVIDERS[acc.type].oauth
        ? "📬"
        : acc.refresh_token
          ? "✅"
          : "❌";
    const display = acc.email || `#${acc.id}`;
    kb.text(`${status} ${display}`, `acc:${acc.id}`).row();
  }
  kb.text(t("accounts:list.addAccount"), "add").row();
  if (options?.isAdmin) {
    kb.text(
      options.showAll
        ? t("accounts:list.collapse")
        : t("accounts:list.viewAll"),
      options.showAll ? "accs" : "accs:all",
    ).row();
  }
  if (options?.showBack) kb.text(t("common:button.back"), "menu");
  return kb;
};

export const accountDetailText = (
  account: Account,
  ownerName?: string,
): string => {
  const klass = PROVIDERS[account.type];
  let text = `${t("accounts:detail.title", { id: account.id })}\n\n`;
  if (account.disabled) {
    text += `${t("common:status.disabled")}\n\n`;
  }
  text += `${t("accounts:detail.typeLabel", { type: klass.displayName })}\n`;
  text += `${t("accounts:detail.email", { email: account.email || t("common:label.notSet") })}\n`;
  text += `Chat ID: ${account.chat_id}\n`;
  if (klass.oauth) {
    const status = account.refresh_token
      ? t("common:status.authorized")
      : t("common:status.notAuthorized");
    text += t("accounts:detail.status", { status });
  } else {
    // 非 OAuth（IMAP）：显示服务器 / 用户名
    text += `${t("accounts:detail.server", { server: `${account.imap_host}:${account.imap_port}${account.imap_secure ? " (TLS)" : ""}` })}\n`;
    text += t("accounts:detail.username", { user: account.imap_user });
  }
  // 需要让用户手动配置归档目标的 provider（目前只有 Gmail）才展示这行
  if (klass.needsArchiveSetup) {
    const archiveLabel =
      account.archive_folder_name ||
      account.archive_folder ||
      t("common:label.notSet");
    text += `\n${t("archive:gmailLabelLine", { label: archiveLabel })}`;
  }
  if (ownerName !== undefined) {
    text += `\n${t("accounts:detail.owner", { name: ownerName || t("common:label.none") })}`;
  }
  return text;
};

export const accountDetailKeyboard = (account: Account): InlineKeyboard => {
  const klass = PROVIDERS[account.type];
  const kb = new InlineKeyboard();
  const toggleLabel = account.disabled
    ? t("accounts:button.enable")
    : t("accounts:button.disable");
  if (klass.oauth) {
    const authLabel = account.refresh_token
      ? t("accounts:button.reauthorize")
      : t("accounts:button.authorize");
    kb.text(authLabel, `acc:${account.id}:auth`);
    if (account.refresh_token) {
      kb.text("🔄 Watch", `acc:${account.id}:w`);
    }
    kb.row();
    kb.text(t("accounts:button.edit"), `acc:${account.id}:edit`);
    // 需要用户手动选归档标签的 provider（Gmail）才显示这个按钮
    if (account.refresh_token && klass.needsArchiveSetup) {
      kb.text(t("archive:gmailLabelButton"), `acc:${account.id}:arc`);
    }
    kb.row();
    kb.text(toggleLabel, `acc:${account.id}:t`);
    kb.text(t("accounts:button.delete"), `acc:${account.id}:del`);
    kb.row();
    kb.text(t("common:button.backToAccounts"), "accs");
  } else {
    kb.text(t("accounts:button.edit"), `acc:${account.id}:edit`);
    kb.text(toggleLabel, `acc:${account.id}:t`).row();
    kb.text(t("accounts:button.delete"), `acc:${account.id}:del`).row();
    kb.text(t("common:button.backToAccounts"), "accs");
  }
  return kb;
};
