/**
 * 从已有 reply_markup 推断当前星标状态 —— 读星按钮的 callback_data：
 * "star" 表示未星标（按钮动作是加星），"unstar" 表示已星标。
 */
export const readStarredFromReplyMarkup = (replyMarkup: unknown): boolean => {
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
};
