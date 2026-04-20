import { RemindersPage } from "@components/reminders";
import {
  countPendingReminders,
  createReminder,
  deletePendingReminder,
  listPendingReminders,
} from "@db/reminders";
import { getUserByTelegramId } from "@db/users";
import {
  ROUTE_REMINDERS,
  ROUTE_REMINDERS_API,
  ROUTE_REMINDERS_API_ITEM,
} from "@handlers/hono/routes";
import {
  REMINDER_PER_USER_LIMIT,
  REMINDER_TEXT_MAX,
} from "@services/reminders";
import { verifyTgInitData } from "@utils/tg-init-data";
import type { Context } from "hono";
import { Hono } from "hono";
import type { AppEnv } from "@/types";

const reminders = new Hono<AppEnv>();

/**
 * 校验 Mini App 调用：从 X-Telegram-Init-Data 头读取 initData，验签后取 user.id；
 * 还需确保该 telegram 用户已被审批（与 requireTelegramLogin 同口径），否则拒绝。
 */
async function authMiniApp(c: Context<AppEnv>): Promise<string | null> {
  const initData = c.req.header("x-telegram-init-data");
  if (!initData) return null;
  const tgUser = await verifyTgInitData(c.env.TELEGRAM_BOT_TOKEN, initData);
  if (!tgUser) return null;
  const telegramId = String(tgUser.id);
  if (telegramId === c.env.ADMIN_TELEGRAM_ID) return telegramId;
  const dbUser = await getUserByTelegramId(c.env.DB, telegramId);
  if (!dbUser || dbUser.approved !== 1) return null;
  return telegramId;
}

// ─── Mini App 页面 ──────────────────────────────────────────────────────────
// 鉴权放在 API 层（initData 校验），页面本身可裸开 —— Mini App 必须能在 TG WebView
// 里直接打开，没有 cookie，无法套 requireTelegramLogin。

reminders.get(ROUTE_REMINDERS, (c) => {
  return c.html(<RemindersPage />);
});

// ─── API: 列表 ───────────────────────────────────────────────────────────────

reminders.get(ROUTE_REMINDERS_API, async (c) => {
  const userId = await authMiniApp(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const items = await listPendingReminders(c.env.DB, userId);
  return c.json({ reminders: items });
});

// ─── API: 创建 ───────────────────────────────────────────────────────────────

reminders.post(ROUTE_REMINDERS_API, async (c) => {
  const userId = await authMiniApp(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req
    .json<{ text?: string; remind_at?: string }>()
    .catch(() => null);
  if (!body) return c.json({ ok: false, error: "请求格式错误" }, 400);

  const text = (body.text ?? "").trim();
  const remindAt = (body.remind_at ?? "").trim();
  if (!text) return c.json({ ok: false, error: "提醒内容不能为空" }, 400);
  if (text.length > REMINDER_TEXT_MAX)
    return c.json(
      { ok: false, error: `提醒内容超过 ${REMINDER_TEXT_MAX} 字` },
      400,
    );

  const ts = Date.parse(remindAt);
  if (Number.isNaN(ts))
    return c.json({ ok: false, error: "时间格式错误" }, 400);
  // 30 秒宽限：客户端时钟稍偏也允许
  if (ts <= Date.now() - 30_000)
    return c.json({ ok: false, error: "提醒时间需在未来" }, 400);

  const count = await countPendingReminders(c.env.DB, userId);
  if (count >= REMINDER_PER_USER_LIMIT)
    return c.json(
      { ok: false, error: `待提醒数已达上限 ${REMINDER_PER_USER_LIMIT}` },
      400,
    );

  const id = await createReminder(
    c.env.DB,
    userId,
    text,
    new Date(ts).toISOString(),
  );
  return c.json({ ok: true, id });
});

// ─── API: 删除 ───────────────────────────────────────────────────────────────

reminders.delete(ROUTE_REMINDERS_API_ITEM, async (c) => {
  const userId = await authMiniApp(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0)
    return c.json({ ok: false, error: "Invalid id" }, 400);
  const ok = await deletePendingReminder(c.env.DB, userId, id);
  if (!ok) return c.json({ ok: false, error: "未找到提醒" }, 404);
  return c.json({ ok: true });
});

export default reminders;
