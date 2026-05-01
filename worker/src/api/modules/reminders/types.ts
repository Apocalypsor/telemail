/** Reminders module 内部 TS 类型声明。route schema / wire 形态在 model.ts。 */
import type { Reminder } from "@worker/db/reminders";

/** `RemindersService.enrich` 在 list 接口里给 reminder 行附加的两列：
 *  - `mail_token` HMAC，让前端能直接拼出邮件预览链接
 *  - `email_summary` LLM 生成的一句话摘要（NULL = 还没分析） */
export type EnrichedReminder = Reminder & {
  mail_token: string | null;
  email_summary: string | null;
};
