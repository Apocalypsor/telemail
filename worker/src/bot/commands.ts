import { getBotCommandsVersion, putBotCommandsVersion } from "@worker/db/kv";
import { t } from "@worker/i18n";
import type { Env } from "@worker/types";
import { memoizeAsync } from "@worker/utils/memoize";
import { Api } from "grammy";
import type { BotCommand } from "grammy/types";

const formatCommandList = (commands: BotCommand[]): string => {
  return commands.map((c) => `/${c.command} \\- ${c.description}`).join("\n");
};

/** 构造 /help 回复文本。 */
export const helpText = (): string => {
  const blocks = [
    t("commands:helpTitle"),
    "",
    t("commands:helpCommands"),
    formatCommandList(BOT_COMMANDS),
  ];
  blocks.push(
    "",
    t("commands:helpFeatures"),
    t("commands:helpFeature1"),
    t("commands:helpFeature2"),
    t("commands:helpFeature3"),
    t("commands:helpFeature4"),
    t("commands:helpFeature5"),
    t("commands:helpFeature6"),
  );
  return blocks.join("\n");
};
// 修改 BOT_COMMANDS 后更新此版本号，会自动 setMyCommands 同步
const BOT_COMMANDS_VERSION = 11;

/** Telegram `/` 自动补全菜单里展示的命令 —— 所有用户可见。
 *  具体功能入口集中放进 /start 面板，避免命令菜单过长。 */
const BOT_COMMANDS: BotCommand[] = [
  { command: "start", description: t("commands:start") },
  { command: "help", description: t("commands:help") },
];

/**
 * 同步 Bot 命令菜单到 Telegram。`memoizeAsync` 保证一个 isolate 生命周期
 * 里只跑一次（首次 KV read 比对版本号；匹配就啥也不做，不匹配就推 TG API
 * 更新菜单 + 写 KV）。webhook 每次调都走内存命中，不再重复 KV read。
 *
 * 要强制重新同步：改 `BOT_COMMANDS_VERSION` + deploy，新 isolate 冷启动
 * 时 memo 为空，再读 KV 发现版本不匹配就会 sync。
 */
export const syncBotCommands = memoizeAsync(async (env: Env): Promise<void> => {
  const cached = await getBotCommandsVersion(env.EMAIL_KV);
  if (cached === String(BOT_COMMANDS_VERSION)) return;

  const api = new Api(env.TELEGRAM_BOT_TOKEN);
  await api.setMyCommands(BOT_COMMANDS);
  await putBotCommandsVersion(env.EMAIL_KV, String(BOT_COMMANDS_VERSION));
});
