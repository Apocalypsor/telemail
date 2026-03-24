import { createBot, getBotInfo, syncBotCommands } from "@bot/index";
import { ROUTE_TELEGRAM_WEBHOOK } from "@handlers/hono/routes";
import { timingSafeEqual } from "@utils/hash";
import { Hono } from "hono";
import type { AppEnv } from "@/types";

const telegram = new Hono<AppEnv>();

telegram.post(ROUTE_TELEGRAM_WEBHOOK, async (c) => {
  const secret = c.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = c.req.query("secret");
  if (!secret || !provided || !timingSafeEqual(provided, secret)) {
    return c.text("Forbidden", 403);
  }

  // 异步同步 Bot 命令菜单（KV 版本号未变时跳过，开销仅一次 KV read）
  c.executionCtx.waitUntil(syncBotCommands(c.env).catch(() => {}));

  const botInfo = await getBotInfo(c.env);
  const bot = createBot(c.env, botInfo);
  const update = await c.req.json();
  try {
    await bot.handleUpdate(update);
  } catch {
    // 始终返回 200，避免 Telegram 无限重试失败的 webhook
  }
  return c.text("OK");
});

export default telegram;
