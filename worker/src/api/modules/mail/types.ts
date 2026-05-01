/** Mail module 内部 TS 类型声明 —— 装不进 TypeBox model 的 discriminated union /
 *  helper alias 都集中在这里。route schema / wire 形态请看 model.ts。 */
import type { Account, MailMeta } from "@worker/types";

/** mail preview 拉取时的 folder 来源 —— IMAP UID per-folder 不通用，所以
 *  star/star-toggle / fetchRaw / setFlag 都要带 folder 提示。 */
export type Folder = "inbox" | "junk" | "archive";

/** `MailService.resolveContext` 的 discriminated 返回 —— 校验失败时携带 status +
 *  error，调用方包装成 Elysia status response。 */
export type ResolveContextResult =
  | {
      ok: true;
      account: Account;
      accountId: number;
      emailMessageId: string;
      token: string;
    }
  | { ok: false; status: 400 | 403 | 404; error: string };

/** `MailService.loadForRendering` 的 discriminated 返回。 */
export type LoadForRenderingResult =
  | {
      ok: true;
      meta: MailMeta;
      /** CID 内联完成、未走图片代理的原始 HTML —— 关闭代理时直接渲染 */
      rawHtml: string;
      /** 在 rawHtml 基础上再做外链图片代理改写 —— 默认渲染这个 */
      proxiedHtml: string;
      fetchFolder: Folder;
      inJunk: boolean;
      starred: boolean;
    }
  | { ok: false; status: 403 | 404; reason: string };

/** `MailService.lookupContext` 的返回 —— 一封邮件在 Telegram 里的位置 + 展示用 subject。 */
export interface LookupContextResult {
  tgChatId: string | null;
  tgMessageId: number | null;
  subject: string | null;
}
