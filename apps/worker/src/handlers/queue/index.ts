import {
  deleteMessage,
  isTelegramRateLimitError,
} from "@worker/clients/telegram";
import { getAccountById } from "@worker/db/accounts";
import { getEmailProvider } from "@worker/providers";
import type { EmailProvider } from "@worker/providers/base";
import {
  type Account,
  type EmailQueueMessage,
  type Env,
  type QueueMessage,
  QueueMessageType,
} from "@worker/types";
import { deliverEmailToTelegram } from "@worker/utils/mail-delivery/deliver";
import { reportErrorToObservability } from "@worker/utils/observability";
import { utf8Decoder } from "@worker/utils/string";

interface EmailProcessingContext {
  account: Account;
  provider: EmailProvider;
}

/** Queue consumer: 按 type 派发邮件投递 / 延迟删 TG 消息等任务 */
const queueHandler = async (
  batch: MessageBatch<QueueMessage>,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> => {
  const waitUntil = ctx.waitUntil.bind(ctx);
  const emailContextCache = new Map<number, EmailProcessingContext | null>();
  for (const msg of batch.messages) {
    try {
      switch (msg.body.type) {
        case QueueMessageType.Email:
          await processEmailMessage(
            msg.body,
            env,
            waitUntil,
            emailContextCache,
          );
          break;
        case QueueMessageType.DeleteTgMessage:
          await deleteMessage(env, msg.body.chatId, msg.body.messageId);
          break;
      }
      msg.ack();
    } catch (error: unknown) {
      if (isTelegramRateLimitError(error)) {
        msg.retry({ delaySeconds: error.delaySeconds });
        continue;
      }
      await reportErrorToObservability(env, "queue.message_failed", error, {
        attempt: msg.attempts,
        body: msg.body,
      });
      msg.retry();
    }
  }
};

/** 按账号类型拉取原始邮件并投递到 Telegram */
const processEmailMessage = async (
  msg: EmailQueueMessage,
  env: Env,
  waitUntil: (p: Promise<unknown>) => void,
  contextCache: Map<number, EmailProcessingContext | null>,
): Promise<void> => {
  const context = await getEmailProcessingContext(env, msg, contextCache);
  if (!context) {
    return;
  }
  const { account, provider } = context;

  const { rawEmail, state } = await provider.fetchRawEmailWithState(
    msg.emailMessageId,
  );
  if (isDeliveryFailure(rawEmail)) {
    try {
      await provider.markAsRead(msg.emailMessageId);
    } catch (err) {
      await reportErrorToObservability(
        env,
        "queue.mark_delivery_failure_read_failed",
        err,
        { accountId: msg.accountId, emailMessageId: msg.emailMessageId },
      );
    }
    return;
  }

  await deliverEmailToTelegram(
    rawEmail,
    msg.emailMessageId,
    account,
    env,
    waitUntil,
    state,
  );
};

const getEmailProcessingContext = async (
  env: Env,
  msg: EmailQueueMessage,
  contextCache: Map<number, EmailProcessingContext | null>,
): Promise<EmailProcessingContext | null> => {
  if (contextCache.has(msg.accountId)) {
    return contextCache.get(msg.accountId) ?? null;
  }

  const account = await getAccountById(env.DB, msg.accountId);
  if (!account) {
    console.log(
      `Account ${msg.accountId} not found, skipping email ${msg.emailMessageId}`,
    );
    contextCache.set(msg.accountId, null);
    return null;
  }
  if (account.disabled) {
    console.log(
      `Account ${msg.accountId} is disabled, dropping email ${msg.emailMessageId}`,
    );
    contextCache.set(msg.accountId, null);
    return null;
  }

  const context = { account, provider: getEmailProvider(account, env) };
  contextCache.set(msg.accountId, context);
  return context;
};

const isDeliveryFailure = (rawEmail: ArrayBuffer): boolean => {
  const raw = utf8Decoder.decode(rawEmail).replace(/\r\n/g, "\n");
  return (
    /^content-type:\s*message\/delivery-status\b/im.test(raw) ||
    (/^reporting-mta:\s*.+$/im.test(raw) && /^action:\s*failed\b/im.test(raw))
  );
};

export default queueHandler;
