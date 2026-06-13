import type { Env } from "@worker/types";
import { cleanupTgForEmail } from "@worker/utils/message-actions";
import { reportErrorToObservability } from "@worker/utils/observability";

export const contentDisposition = (filename: string | null): string => {
  const fallback = (filename || "attachment").replace(/[^\w. -]/g, "_");
  const quoted = fallback.replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename || "attachment");
  return `attachment; filename="${quoted}"; filename*=UTF-8''${encoded}`;
};

export const schedulePreviewTelegramCleanup = (
  executionCtx: ExecutionContext,
  env: Env,
  accountId: number,
  emailMessageId: string,
): void => {
  executionCtx.waitUntil(
    cleanupTgForEmail(env, accountId, emailMessageId).catch((err) =>
      reportErrorToObservability(env, "preview.cleanup_tg_failed", err, {
        accountId,
        emailMessageId,
      }),
    ),
  );
};
