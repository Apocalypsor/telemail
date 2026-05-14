import { authMiniApp } from "@worker/api/plugins/auth-miniapp";
import { cf } from "@worker/api/plugins/cf";
import { Elysia } from "elysia";
import {
  AccountIdParams,
  AccountListQuery,
  ArchiveLabelBody,
  AssignOwnerBody,
  CreateImapAccountBody,
  CreateOAuthAccountBody,
  ToggleDisabledBody,
  UpdateChatIdBody,
} from "./model";
import { AccountsService } from "./service";
import { requireAccountId } from "./utils";

export const accountsController = new Elysia({
  name: "controller.accounts",
})
  .use(cf)
  .use(authMiniApp)

  .get(
    "/api/accounts",
    async ({ env, userId, isAdmin, query, status }) => {
      const result = await AccountsService.listAccounts(
        env,
        userId,
        isAdmin,
        query.scope ?? "own",
      );
      if (!result.ok) return status(result.status, { error: result.error });
      return result.data;
    },
    { query: AccountListQuery },
  )

  .get(
    "/api/accounts/:id",
    async ({ env, userId, isAdmin, params, status }) => {
      const parsed = requireAccountId(params.id);
      if (!parsed.ok) return status(400, { error: parsed.error });
      const result = await AccountsService.getAccountDetail(
        env,
        userId,
        isAdmin,
        parsed.accountId,
      );
      if (!result.ok) return status(result.status, { error: result.error });
      return result.data;
    },
    { params: AccountIdParams },
  )

  .post(
    "/api/accounts/oauth",
    async ({ env, userId, body, status }) => {
      const result = await AccountsService.createOAuthAccount(
        env,
        userId,
        body,
      );
      if (!result.ok) return status(result.status, { error: result.error });
      return result.data;
    },
    { body: CreateOAuthAccountBody },
  )

  .post(
    "/api/accounts/imap",
    async ({ env, userId, body, status }) => {
      const result = await AccountsService.createImapAccount(env, userId, body);
      if (!result.ok) return status(result.status, { error: result.error });
      return result.data;
    },
    { body: CreateImapAccountBody },
  )

  .post(
    "/api/accounts/:id/oauth-url",
    async ({ env, userId, isAdmin, params, status }) => {
      const parsed = requireAccountId(params.id);
      if (!parsed.ok) return status(400, { error: parsed.error });
      const result = await AccountsService.createOAuthUrl(
        env,
        userId,
        isAdmin,
        parsed.accountId,
      );
      if (!result.ok) return status(result.status, { error: result.error });
      return result.data;
    },
    { params: AccountIdParams },
  )

  .post(
    "/api/accounts/:id/renew-push",
    async ({ env, userId, isAdmin, params, status }) => {
      const parsed = requireAccountId(params.id);
      if (!parsed.ok) return status(400, { error: parsed.error });
      const result = await AccountsService.renewPush(
        env,
        userId,
        isAdmin,
        parsed.accountId,
      );
      if (!result.ok) return status(result.status, { error: result.error });
      return result.data;
    },
    { params: AccountIdParams },
  )

  .patch(
    "/api/accounts/:id/chat-id",
    async ({ env, userId, isAdmin, params, body, status }) => {
      const parsed = requireAccountId(params.id);
      if (!parsed.ok) return status(400, { error: parsed.error });
      const result = await AccountsService.updateChatId(
        env,
        userId,
        isAdmin,
        parsed.accountId,
        body,
      );
      if (!result.ok) return status(result.status, { error: result.error });
      return result.data;
    },
    { params: AccountIdParams, body: UpdateChatIdBody },
  )

  .patch(
    "/api/accounts/:id/disabled",
    async ({ env, userId, isAdmin, params, body, status }) => {
      const parsed = requireAccountId(params.id);
      if (!parsed.ok) return status(400, { error: parsed.error });
      const result = await AccountsService.setDisabled(
        env,
        userId,
        isAdmin,
        parsed.accountId,
        body,
      );
      if (!result.ok) return status(result.status, { error: result.error });
      return result.data;
    },
    { params: AccountIdParams, body: ToggleDisabledBody },
  )

  .patch(
    "/api/accounts/:id/owner",
    async ({ env, userId, isAdmin, params, body, status }) => {
      const parsed = requireAccountId(params.id);
      if (!parsed.ok) return status(400, { error: parsed.error });
      const result = await AccountsService.assignOwner(
        env,
        userId,
        isAdmin,
        parsed.accountId,
        body,
      );
      if (!result.ok) return status(result.status, { error: result.error });
      return result.data;
    },
    { params: AccountIdParams, body: AssignOwnerBody },
  )

  .get(
    "/api/accounts/:id/archive-labels",
    async ({ env, userId, isAdmin, params, status }) => {
      const parsed = requireAccountId(params.id);
      if (!parsed.ok) return status(400, { error: parsed.error });
      const result = await AccountsService.listArchiveLabels(
        env,
        userId,
        isAdmin,
        parsed.accountId,
      );
      if (!result.ok) return status(result.status, { error: result.error });
      return result.data;
    },
    { params: AccountIdParams },
  )

  .put(
    "/api/accounts/:id/archive-label",
    async ({ env, userId, isAdmin, params, body, status }) => {
      const parsed = requireAccountId(params.id);
      if (!parsed.ok) return status(400, { error: parsed.error });
      const result = await AccountsService.setArchiveLabel(
        env,
        userId,
        isAdmin,
        parsed.accountId,
        body,
      );
      if (!result.ok) return status(result.status, { error: result.error });
      return result.data;
    },
    { params: AccountIdParams, body: ArchiveLabelBody },
  )

  .delete(
    "/api/accounts/:id",
    async ({ env, userId, isAdmin, params, status }) => {
      const parsed = requireAccountId(params.id);
      if (!parsed.ok) return status(400, { error: parsed.error });
      const result = await AccountsService.deleteAccount(
        env,
        userId,
        isAdmin,
        parsed.accountId,
      );
      if (!result.ok) return status(result.status, { error: result.error });
      return { ok: true };
    },
    { params: AccountIdParams },
  );
