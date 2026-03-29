import { t } from "@i18n";
import { markAsReadByMessage, toggleStar } from "@services/message-actions";
import { reportErrorToObservability } from "@utils/observability";
import type { Bot } from "grammy";
import type { MessageEntity } from "grammy/types";
import type { Env } from "@/types";

/** 在消息文本末尾追加 #星标 标签 */
function appendStarTag(
  text: string,
  entities: MessageEntity[],
): { text: string; entities: MessageEntity[] } {
  const tag = t("star:tag");
  if (text.endsWith(tag)) return { text, entities };
  const newText = text + tag;
  return {
    text: newText,
    entities: [
      ...entities,
      { type: "hashtag", offset: text.length + 1, length: tag.length - 1 },
    ],
  };
}

/** 从消息文本末尾移除 #星标 标签 */
function stripStarTag(
  text: string,
  entities: MessageEntity[],
): { text: string; entities: MessageEntity[] } {
  const tag = t("star:tag");
  if (!text.endsWith(tag)) return { text, entities };
  const newText = text.slice(0, -tag.length);
  return {
    text: newText,
    entities: entities.filter((e) => e.offset + e.length <= newText.length),
  };
}

/** 星标/取消星标 inline button callback */
export function registerStarHandler(bot: Bot, env: Env) {
  bot.callbackQuery("star", async (ctx) => {
    const msg = ctx.callbackQuery.message;
    if (!msg) return;

    try {
      const result = await toggleStar(
        env,
        String(msg.chat.id),
        msg.message_id,
        true,
      );
      if (!result.ok) {
        await ctx.answerCallbackQuery({ text: result.reason });
        return;
      }

      if ("caption" in msg && msg.caption) {
        const { text: newCaption, entities: newEntities } = appendStarTag(
          msg.caption,
          (msg.caption_entities as MessageEntity[]) || [],
        );
        await ctx.editMessageCaption({
          caption: newCaption,
          caption_entities: newEntities,
          reply_markup: result.keyboard,
        });
      } else if ("text" in msg && msg.text) {
        const { text: newText, entities: newEntities } = appendStarTag(
          msg.text,
          (msg.entities as MessageEntity[]) || [],
        );
        await ctx.editMessageText(newText, {
          entities: newEntities,
          reply_markup: result.keyboard,
        });
      } else {
        await ctx.editMessageReplyMarkup({ reply_markup: result.keyboard });
      }

      // 星标同时自动标记已读
      await markAsReadByMessage(env, String(msg.chat.id), msg.message_id);

      await ctx.answerCallbackQuery({ text: t("star:starred") });
      console.log(`Starred: email=${result.emailMessageId}`);
    } catch (err) {
      await reportErrorToObservability(env, "bot.star_failed", err);
      await ctx.answerCallbackQuery({
        text: t("common:error.operationFailed"),
      });
    }
  });

  bot.callbackQuery("unstar", async (ctx) => {
    const msg = ctx.callbackQuery.message;
    if (!msg) return;

    try {
      const result = await toggleStar(
        env,
        String(msg.chat.id),
        msg.message_id,
        false,
      );
      if (!result.ok) {
        await ctx.answerCallbackQuery({ text: result.reason });
        return;
      }

      if ("caption" in msg && msg.caption) {
        const { text: newCaption, entities: newEntities } = stripStarTag(
          msg.caption,
          (msg.caption_entities as MessageEntity[]) || [],
        );
        await ctx.editMessageCaption({
          caption: newCaption,
          caption_entities: newEntities,
          reply_markup: result.keyboard,
        });
      } else if ("text" in msg && msg.text) {
        const { text: newText, entities: newEntities } = stripStarTag(
          msg.text,
          (msg.entities as MessageEntity[]) || [],
        );
        await ctx.editMessageText(newText, {
          entities: newEntities,
          reply_markup: result.keyboard,
        });
      } else {
        await ctx.editMessageReplyMarkup({ reply_markup: result.keyboard });
      }

      await ctx.answerCallbackQuery({ text: t("star:unstarred") });
      console.log(`Unstarred: email=${result.emailMessageId}`);
    } catch (err) {
      await reportErrorToObservability(env, "bot.unstar_failed", err);
      await ctx.answerCallbackQuery({
        text: t("common:error.operationFailed"),
      });
    }
  });
}
