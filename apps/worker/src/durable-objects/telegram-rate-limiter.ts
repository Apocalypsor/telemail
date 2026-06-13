import { DurableObject } from "cloudflare:workers";

export type TelegramRateLimitReason = "blocked" | "paced";

export type TelegramRateLimitReservation =
  | { ok: true }
  | {
      ok: false;
      delayMs: number;
      delaySeconds: number;
      reason: TelegramRateLimitReason;
    };

const BLOCKED_UNTIL_STORAGE_KEY = "blocked_until_by_key";
const GLOBAL_BUCKET_KEY = "global";
const CHAT_BUCKET_PREFIX = "chat:";
const GLOBAL_MIN_INTERVAL_MS = 150;
const CHAT_MIN_INTERVAL_MS = 1_000;
const RATE_LIMIT_BUFFER_MS = 1_000;

export class TelegramRateLimiter extends DurableObject {
  private blockedUntilByKey: Record<string, number> = {};
  private nextAllowedAtByKey: Record<string, number> = {};

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.blockedUntilByKey =
        (await this.ctx.storage.get<Record<string, number>>(
          BLOCKED_UNTIL_STORAGE_KEY,
        )) ?? {};
    });
  }

  reserve(chatId: string): TelegramRateLimitReservation {
    const now = Date.now();
    const bucketKeys = this.getBucketKeys(chatId);
    const blockedDelayMs = this.getMaxDelayMs(
      bucketKeys.map((key) => this.blockedUntilByKey[key]),
      now,
    );
    if (blockedDelayMs > 0) {
      return buildDelayedReservation(blockedDelayMs, "blocked");
    }

    const pacedDelayMs = this.getMaxDelayMs(
      bucketKeys.map((key) => this.nextAllowedAtByKey[key]),
      now,
    );
    if (pacedDelayMs > 0) {
      return buildDelayedReservation(pacedDelayMs, "paced");
    }

    this.nextAllowedAtByKey[GLOBAL_BUCKET_KEY] = now + GLOBAL_MIN_INTERVAL_MS;
    this.nextAllowedAtByKey[this.getChatBucketKey(chatId)] =
      now + CHAT_MIN_INTERVAL_MS;
    return { ok: true };
  }

  async recordRateLimit(
    chatId: string,
    retryAfterSeconds: number,
  ): Promise<TelegramRateLimitReservation> {
    const now = Date.now();
    const blockedUntil =
      now + Math.max(1, retryAfterSeconds) * 1_000 + RATE_LIMIT_BUFFER_MS;
    for (const key of this.getBucketKeys(chatId)) {
      this.blockedUntilByKey[key] = Math.max(
        this.blockedUntilByKey[key] ?? 0,
        blockedUntil,
      );
    }
    await this.ctx.storage.put(
      BLOCKED_UNTIL_STORAGE_KEY,
      this.blockedUntilByKey,
    );
    return buildDelayedReservation(blockedUntil - now, "blocked");
  }

  private getBucketKeys(chatId: string): string[] {
    return [GLOBAL_BUCKET_KEY, this.getChatBucketKey(chatId)];
  }

  private getChatBucketKey(chatId: string): string {
    return `${CHAT_BUCKET_PREFIX}${chatId}`;
  }

  private getMaxDelayMs(
    values: Array<number | undefined>,
    now: number,
  ): number {
    return Math.max(0, ...values.map((value) => (value ?? 0) - now));
  }
}

const buildDelayedReservation = (
  delayMs: number,
  reason: TelegramRateLimitReason,
): TelegramRateLimitReservation => {
  const normalizedDelayMs = Math.max(1, Math.ceil(delayMs));
  return {
    ok: false,
    delayMs: normalizedDelayMs,
    delaySeconds: Math.max(1, Math.ceil(normalizedDelayMs / 1_000)),
    reason,
  };
};
