import { authAny } from "@worker/api/plugins/auth-any";
import { cf } from "@worker/api/plugins/cf";
import { Elysia } from "elysia";
import { ComposeOptimizeBody, ComposeSendBody } from "./model";
import { ComposeService } from "./service";

export const composeController = new Elysia({ name: "controller.compose" })
  .use(cf)
  .use(authAny)
  .get("/api/compose/accounts", async ({ env, userId, isAdmin, status }) => {
    const result = await ComposeService.listAccounts(env, userId, isAdmin);
    if (!result.ok) return status(result.status, { error: result.error });
    return result.data;
  })

  .post(
    "/api/compose/optimize",
    async ({ env, userId, isAdmin, body, status }) => {
      const result = await ComposeService.optimize(env, userId, isAdmin, body);
      if (!result.ok)
        return status(result.status, { ok: false, error: result.error });
      return result.data;
    },
    { body: ComposeOptimizeBody },
  )

  .post(
    "/api/compose/send",
    async ({ env, userId, isAdmin, body, status }) => {
      const result = await ComposeService.send(env, userId, isAdmin, body);
      if (!result.ok)
        return status(result.status, { ok: false, error: result.error });
      return { ok: true, message: result.message };
    },
    { body: ComposeSendBody },
  );
