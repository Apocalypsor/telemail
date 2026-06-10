import { authMiniApp } from "@worker/api/plugins/auth-miniapp";
import { cf } from "@worker/api/plugins/cf";
import { Elysia } from "elysia";
import { UserIdParams } from "./model";
import { UsersService } from "./service";

export const usersController = new Elysia({
  name: "controller.users",
})
  .use(cf)
  .use(authMiniApp)

  .get("/api/users", async ({ env, isAdmin, status }) => {
    const result = await UsersService.listUsers(env, isAdmin);
    if (!result.ok) return status(result.status, { error: result.error });
    return result.data;
  })

  .post(
    "/api/users/:id/approve",
    async ({ env, isAdmin, params, status }) => {
      const result = await UsersService.approveUser(env, isAdmin, params.id);
      if (!result.ok) return status(result.status, { error: result.error });
      return result.data;
    },
    { params: UserIdParams },
  )

  .post(
    "/api/users/:id/revoke",
    async ({ env, isAdmin, params, status }) => {
      const result = await UsersService.revokeUser(env, isAdmin, params.id);
      if (!result.ok) return status(result.status, { error: result.error });
      return result.data;
    },
    { params: UserIdParams },
  )

  .delete(
    "/api/users/:id",
    async ({ env, isAdmin, params, status }) => {
      const result = await UsersService.deleteUser(env, isAdmin, params.id);
      if (!result.ok) return status(result.status, { error: result.error });
      return result.data;
    },
    { params: UserIdParams },
  );
