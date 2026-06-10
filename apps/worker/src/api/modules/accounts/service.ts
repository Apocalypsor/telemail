import {
  createAccount,
  createImapAccount,
  getAllAccounts,
  getOwnAccounts,
  setAccountDisabled,
  setArchiveFolder,
  updateAccount,
} from "@worker/db/accounts";
import { getAllUsers, getUserByTelegramId } from "@worker/db/users";
import { getEmailProvider, PROVIDERS } from "@worker/providers";
import type { GmailProvider } from "@worker/providers/gmail";
import {
  isImapBridgeConfigured,
  syncAccounts,
} from "@worker/providers/imap/utils/client";
import type { Env } from "@worker/types";
import { cleanupAndDeleteAccount } from "@worker/utils/accounts";
import { reportErrorToObservability } from "@worker/utils/observability";
import type {
  ArchiveLabelBody,
  AssignOwnerBody,
  CreateImapAccountBody,
  CreateOAuthAccountBody,
  ToggleDisabledBody,
  UpdateChatIdBody,
} from "./model";
import type {
  AccountDetailResult,
  AccountMutationResult,
  AccountsResult,
  CreateOAuthAccountResult,
} from "./types";
import {
  getAuthorizedAccountOrResult,
  normalizeChatId,
  oauthCallbackUrl,
  toAccountResponse,
  toProviderOptions,
  toUserOption,
} from "./utils";

export abstract class AccountsService {
  static async listAccounts(
    env: Env,
    userId: string,
    isAdmin: boolean,
    scope: "own" | "all" = "own",
  ): Promise<AccountsResult> {
    if (scope === "all" && !isAdmin) {
      return { ok: false, status: 403, error: "无权查看所有账号" };
    }

    const [accounts, users] = await Promise.all([
      scope === "all" ? getAllAccounts(env.DB) : getOwnAccounts(env.DB, userId),
      isAdmin ? getAllUsers(env.DB) : Promise.resolve([]),
    ]);

    return {
      ok: true,
      data: {
        accounts: await Promise.all(
          accounts.map((account) => toAccountResponse(env, account)),
        ),
        providers: toProviderOptions(env),
        users: users.map(toUserOption),
        canViewAll: isAdmin,
        scope,
        currentUserId: userId,
      },
    };
  }

  static async getAccountDetail(
    env: Env,
    userId: string,
    isAdmin: boolean,
    accountId: number,
  ): Promise<AccountDetailResult> {
    const account = await getAuthorizedAccountOrResult(
      env,
      accountId,
      userId,
      isAdmin,
    );
    if ("ok" in account) return account;

    const users = isAdmin ? await getAllUsers(env.DB) : [];
    return {
      ok: true,
      data: {
        account: await toAccountResponse(env, account),
        users: users.map(toUserOption),
        canViewAll: isAdmin,
        currentUserId: userId,
      },
    };
  }

  static async createOAuthAccount(
    env: Env,
    userId: string,
    body: CreateOAuthAccountBody,
  ): Promise<CreateOAuthAccountResult> {
    const chatId = normalizeChatId(body.chatId);
    if (!chatId) return { ok: false, status: 400, error: "Chat ID 必须为数字" };

    const klass = PROVIDERS[body.type];
    const oauth = klass.oauth;
    if (!oauth)
      return { ok: false, status: 400, error: "该账号类型不支持 OAuth" };
    if (!oauth.isConfigured(env)) {
      return {
        ok: false,
        status: 400,
        error: `${oauth.name} OAuth 未配置，请联系管理员`,
      };
    }

    const account = await createAccount(env.DB, chatId, userId, body.type);
    const oauthUrl = await oauth.generateOAuthUrl(
      env,
      account.id,
      oauthCallbackUrl(env, body.type),
    );
    return {
      ok: true,
      data: {
        account: await toAccountResponse(env, account),
        oauthUrl,
      },
    };
  }

  static async createImapAccount(
    env: Env,
    userId: string,
    body: CreateImapAccountBody,
  ): Promise<AccountMutationResult> {
    if (!isImapBridgeConfigured(env)) {
      return {
        ok: false,
        status: 400,
        error: "IMAP 中间件未配置，请联系管理员",
      };
    }

    const chatId = normalizeChatId(body.chatId);
    if (!chatId) return { ok: false, status: 400, error: "Chat ID 必须为数字" };

    const imapHost = body.imapHost.trim();
    const imapUser = body.imapUser.trim();
    const imapPass = body.imapPass.trim();
    const imapPort = Math.trunc(body.imapPort);
    if (!imapHost)
      return { ok: false, status: 400, error: "服务器地址不能为空" };
    if (!Number.isInteger(imapPort) || imapPort < 1 || imapPort > 65535) {
      return { ok: false, status: 400, error: "端口必须在 1 到 65535 之间" };
    }
    if (!imapUser) return { ok: false, status: 400, error: "用户名不能为空" };
    if (!imapPass) return { ok: false, status: 400, error: "密码不能为空" };

    const account = await createImapAccount(env.DB, {
      chatId,
      telegramUserId: userId,
      email: imapUser,
      imapHost,
      imapPort,
      imapSecure: body.imapSecure ? 1 : 0,
      imapUser,
      imapPass,
    });

    await syncAccounts(env).catch((err) =>
      reportErrorToObservability(env, "imap.sync_after_create_failed", err, {
        accountId: account.id,
      }),
    );

    return {
      ok: true,
      data: { account: await toAccountResponse(env, account) },
    };
  }

  static async createOAuthUrl(
    env: Env,
    userId: string,
    isAdmin: boolean,
    accountId: number,
  ): Promise<CreateOAuthAccountResult> {
    const account = await getAuthorizedAccountOrResult(
      env,
      accountId,
      userId,
      isAdmin,
    );
    if ("ok" in account) return account;

    const oauth = PROVIDERS[account.type].oauth;
    if (!oauth)
      return { ok: false, status: 400, error: "IMAP 账号不需要 OAuth" };
    if (!oauth.isConfigured(env)) {
      return {
        ok: false,
        status: 400,
        error: `${oauth.name} OAuth 未配置，请联系管理员`,
      };
    }

    const oauthUrl = await oauth.generateOAuthUrl(
      env,
      account.id,
      oauthCallbackUrl(env, account.type),
    );
    return {
      ok: true,
      data: { account: await toAccountResponse(env, account), oauthUrl },
    };
  }

  static async renewPush(
    env: Env,
    userId: string,
    isAdmin: boolean,
    accountId: number,
  ): Promise<AccountMutationResult> {
    const account = await getAuthorizedAccountOrResult(
      env,
      accountId,
      userId,
      isAdmin,
    );
    if ("ok" in account) return account;
    if (!account.refresh_token) {
      return { ok: false, status: 400, error: "账号未授权" };
    }

    await getEmailProvider(account, env).renewPush();
    return {
      ok: true,
      data: { account: await toAccountResponse(env, account) },
    };
  }

  static async updateChatId(
    env: Env,
    userId: string,
    isAdmin: boolean,
    accountId: number,
    body: UpdateChatIdBody,
  ): Promise<AccountMutationResult> {
    const account = await getAuthorizedAccountOrResult(
      env,
      accountId,
      userId,
      isAdmin,
    );
    if ("ok" in account) return account;

    const chatId = normalizeChatId(body.chatId);
    if (!chatId) return { ok: false, status: 400, error: "Chat ID 必须为数字" };

    await updateAccount(env.DB, account.id, chatId);
    const updated = { ...account, chat_id: chatId };
    return {
      ok: true,
      data: { account: await toAccountResponse(env, updated) },
    };
  }

  static async setDisabled(
    env: Env,
    userId: string,
    isAdmin: boolean,
    accountId: number,
    body: ToggleDisabledBody,
  ): Promise<AccountMutationResult> {
    const account = await getAuthorizedAccountOrResult(
      env,
      accountId,
      userId,
      isAdmin,
    );
    if ("ok" in account) return account;

    await setAccountDisabled(env.DB, account.id, body.disabled);
    await getEmailProvider(account, env)
      .onPersistedChange()
      .catch((err) =>
        reportErrorToObservability(
          env,
          "account.on_persisted_change_failed",
          err,
          { accountId: account.id },
        ),
      );

    const updated = { ...account, disabled: body.disabled ? 1 : 0 };
    return {
      ok: true,
      data: { account: await toAccountResponse(env, updated) },
    };
  }

  static async assignOwner(
    env: Env,
    userId: string,
    isAdmin: boolean,
    accountId: number,
    body: AssignOwnerBody,
  ): Promise<AccountMutationResult> {
    if (!isAdmin) return { ok: false, status: 403, error: "无权操作" };
    const account = await getAuthorizedAccountOrResult(
      env,
      accountId,
      userId,
      true,
    );
    if ("ok" in account) return account;

    const ownerId = body.telegramUserId.trim();
    const owner = await getUserByTelegramId(env.DB, ownerId);
    if (!owner) return { ok: false, status: 404, error: "用户不存在" };

    await updateAccount(env.DB, account.id, account.chat_id, ownerId);
    const updated = { ...account, telegram_user_id: ownerId };
    return {
      ok: true,
      data: { account: await toAccountResponse(env, updated) },
    };
  }

  static async deleteAccount(
    env: Env,
    userId: string,
    isAdmin: boolean,
    accountId: number,
  ): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    const account = await getAuthorizedAccountOrResult(
      env,
      accountId,
      userId,
      isAdmin,
    );
    if ("ok" in account) return account;

    await cleanupAndDeleteAccount(env, account);
    return { ok: true };
  }

  static async listArchiveLabels(
    env: Env,
    userId: string,
    isAdmin: boolean,
    accountId: number,
  ): Promise<
    | { ok: true; data: { labels: { id: string; name: string }[] } }
    | { ok: false; status: number; error: string }
  > {
    const account = await getAuthorizedAccountOrResult(
      env,
      accountId,
      userId,
      isAdmin,
    );
    if ("ok" in account) return account;
    if (!PROVIDERS[account.type].needsArchiveSetup) {
      return { ok: false, status: 400, error: "该账号不需要设置归档标签" };
    }
    if (!account.refresh_token) {
      return { ok: false, status: 400, error: "账号未授权" };
    }

    const provider = getEmailProvider(account, env) as GmailProvider;
    return { ok: true, data: { labels: await provider.listLabels() } };
  }

  static async setArchiveLabel(
    env: Env,
    userId: string,
    isAdmin: boolean,
    accountId: number,
    body: ArchiveLabelBody,
  ): Promise<AccountMutationResult> {
    const account = await getAuthorizedAccountOrResult(
      env,
      accountId,
      userId,
      isAdmin,
    );
    if ("ok" in account) return account;
    if (!PROVIDERS[account.type].needsArchiveSetup) {
      return { ok: false, status: 400, error: "该账号不需要设置归档标签" };
    }

    let labelId: string | null = body.labelId;
    let labelName: string | null = null;
    if (labelId) {
      if (!account.refresh_token) {
        return { ok: false, status: 400, error: "账号未授权" };
      }
      const provider = getEmailProvider(account, env) as GmailProvider;
      const labels = await provider.listLabels();
      const match = labels.find((label) => label.id === labelId);
      if (!match) return { ok: false, status: 400, error: "归档标签不存在" };
      labelId = match.id;
      labelName = match.name;
    }

    await setArchiveFolder(env.DB, account.id, labelId, labelName);
    const updated = {
      ...account,
      archive_folder: labelId,
      archive_folder_name: labelName,
    };
    return {
      ok: true,
      data: { account: await toAccountResponse(env, updated) },
    };
  }
}
