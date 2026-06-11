import { getTelegramForumTopics, putTelegramForumTopics } from "@worker/db/kv";
import { t } from "@worker/i18n";
import type { Env } from "@worker/types";
import { reportErrorToObservability } from "@worker/utils/observability";
import type { Context } from "grammy";

export const onboardForumGroupIfNeeded = async (
  ctx: Context,
  env: Env,
): Promise<string | null> => {
  const chat = ctx.chat;
  if (chat?.type !== "supergroup" || chat.is_forum !== true) return null;

  const chatId = String(chat.id);
  const existing = await getTelegramForumTopics(env.EMAIL_KV, chatId);
  if (existing) return null;

  try {
    const inboxTopic = await ctx.api.createForumTopic(
      chatId,
      t("topics:inboxTopicName"),
    );
    await putTelegramForumTopics(env.EMAIL_KV, chatId, {
      inboxTopicId: inboxTopic.message_thread_id,
      onboardedAt: Date.now(),
    });
    await ctx.api
      .sendMessage(
        chatId,
        t("topics:onboarded", {
          chatId,
          inboxTopicId: inboxTopic.message_thread_id,
        }),
        { message_thread_id: inboxTopic.message_thread_id },
      )
      .catch((err) =>
        reportErrorToObservability(env, "bot.inbox_topic_notice_failed", err, {
          chatId,
        }),
      );
    return null;
  } catch (err) {
    await reportErrorToObservability(
      env,
      "bot.inbox_topic_create_failed",
      err,
      {
        chatId,
      },
    );
    return t("topics:onboardFailed");
  }
};

export const threadReplyOptions = (
  messageThreadId: number | undefined,
): { message_thread_id?: number } => {
  return messageThreadId ? { message_thread_id: messageThreadId } : {};
};
