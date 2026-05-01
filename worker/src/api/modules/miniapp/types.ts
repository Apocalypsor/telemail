/** Miniapp module 内部 TS 类型。route schema / wire 形态在 model.ts。 */
import type { MailListAccountResult, MailListType } from "./model";

/** `MiniappService.getMailList` 返回 —— `pendingSideEffects` 给调用方用
 *  `ctx.waitUntil` 在响应后台跑（如 starred 同步键盘 / junk 清 mapping）。 */
export interface MailListResult {
  type: MailListType;
  results: MailListAccountResult[];
  total: number;
  pendingSideEffects: (() => Promise<void>)[];
}

/** `MiniappService.searchMail` 返回 —— 跟 `MailListResult` 几乎一致，
 *  但搜索是只读的所以没有 pendingSideEffects。 */
export interface MailSearchResult {
  query: string;
  results: MailListAccountResult[];
  total: number;
}
