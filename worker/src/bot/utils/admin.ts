import { ROUTE_MINI_APP_COMPOSE } from "@page/paths";
import { formatUserName } from "@worker/bot/utils/user-format";
import { countFailedEmails, type FailedEmail } from "@worker/db/failed-emails";
import { t } from "@worker/i18n";
import type { Env, TelegramUser } from "@worker/types";
import { escapeMdV2 } from "@worker/utils/markdown-v2";
import { InlineKeyboard } from "grammy";

export const SECRETS_AUTO_DELETE_SECONDS = 60;

const codeEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`");

export const adminMenuKeyboard = async (env: Env): Promise<InlineKeyboard> => {
  const failedCount = await countFailedEmails(env.DB);
  const failedLabel =
    failedCount > 0
      ? t("admin:failedEmails.titleWithCount", { count: failedCount })
      : t("admin:failedEmails.title");
  const base = env.WORKER_URL.replace(/\/$/, "");
  const kb = new InlineKeyboard()
    .webApp(t("admin:compose"), `${base}${ROUTE_MINI_APP_COMPOSE}`)
    .row()
    .text(t("keyboards:menu.userManagement"), "users")
    .row()
    .text(failedLabel, "failed")
    .row()
    .text(t("admin:renewWatch"), "walla")
    .row()
    .text(t("admin:secrets.button"), "secrets")
    .row();
  kb.url(t("admin:htmlPreview"), `${base}/preview`).row();
  kb.url(t("admin:junkCheck"), `${base}/junk-check`).row();
  kb.text(t("common:button.back"), "menu");
  return kb;
};

export const buildSecretsText = (env: Env): string => {
  const secrets: Array<{ label: string; value: string }> = [
    { label: "TELEGRAM_WEBHOOK_SECRET", value: env.TELEGRAM_WEBHOOK_SECRET },
    { label: "ADMIN_SECRET", value: env.ADMIN_SECRET },
    { label: "ADMIN_TELEGRAM_ID", value: env.ADMIN_TELEGRAM_ID },
  ];

  const lines: string[] = [`*${escapeMdV2(t("admin:secrets.title"))}*`];
  for (const { label, value } of secrets) {
    lines.push(``, escapeMdV2(label), `\`${codeEsc(value)}\``);
  }
  const url = `${env.WORKER_URL.replace(/\/$/, "")}/api/telegram/webhook?secret=${env.TELEGRAM_WEBHOOK_SECRET}`;
  lines.push(
    ``,
    escapeMdV2(t("admin:secrets.webhookUrlLabel")),
    `\`${codeEsc(url)}\``,
  );

  lines.push(
    ``,
    t("admin:secrets.autoDeleteHint", {
      seconds: SECRETS_AUTO_DELETE_SECONDS,
    }),
  );
  return lines.join("\n");
};

export const userListText = (users: TelegramUser[]): string => {
  if (users.length === 0) return t("admin:users.noUsers");

  let text = `${t("admin:users.title", { count: users.length })}\n\n`;
  for (const u of users) {
    const status = u.approved === 1 ? "✅" : "⏳";
    const name = formatUserName(u);
    const username = u.username ? ` @${u.username}` : "";
    text += `${status} ${name}${username}\n   ID: ${u.telegram_id}\n`;
  }
  return text;
};

export const userListKeyboard = (
  users: TelegramUser[],
  opts?: { showBack?: boolean; backCallback?: string },
): InlineKeyboard => {
  const kb = new InlineKeyboard();
  for (const u of users) {
    const name = formatUserName(u);
    if (u.approved === 1) {
      kb.text(`✅ ${name}`, `u:${u.telegram_id}:info`)
        .text(t("admin:users.revoke"), `u:${u.telegram_id}:r`)
        .text("🗑", `u:${u.telegram_id}:del`);
    } else {
      kb.text(`⏳ ${name}`, `u:${u.telegram_id}:info`)
        .text(t("admin:users.approve"), `u:${u.telegram_id}:a`)
        .text("🗑", `u:${u.telegram_id}:del`);
    }
    kb.row();
  }
  if (opts?.showBack)
    kb.text(t("common:button.back"), opts.backCallback ?? "admin");
  return kb;
};

export const failedEmailListMessage = (
  items: FailedEmail[],
): {
  text: string;
  keyboard: InlineKeyboard;
} => {
  if (items.length === 0) {
    return {
      text: t("admin:failedEmails.noRecords"),
      keyboard: new InlineKeyboard().text(t("common:button.back"), "admin"),
    };
  }
  const lines = items.map((item, i) => {
    const date = item.created_at.toISOString().replace("T", " ").slice(0, 16);
    const subj = item.subject
      ? item.subject.length > 30
        ? `${item.subject.slice(0, 30)}…`
        : item.subject
      : t("common:label.noSubjectParen");
    return `${i + 1}. ${subj}\n   ${date} | ${item.error_message?.slice(0, 40) || t("common:error.unknownError")}`;
  });
  const kb = new InlineKeyboard()
    .text(t("admin:failedEmails.retryAll"), "retry_all")
    .text(t("admin:failedEmails.clearAll"), "failed_clear")
    .row();
  for (const item of items) {
    const label = item.subject
      ? item.subject.length > 15
        ? `${item.subject.slice(0, 15)}…`
        : item.subject
      : `#${item.id}`;
    kb.text(`🔄 ${label}`, `fr:${item.id}`).text("🗑", `fd:${item.id}`).row();
  }
  kb.text(t("common:button.back"), "admin");
  return {
    text: `${t("admin:failedEmails.titleWithCount", { count: items.length })}\n\n${lines.join("\n\n")}`,
    keyboard: kb,
  };
};
