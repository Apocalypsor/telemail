import { authMiniApp } from "@worker/api/plugins/auth-miniapp";
import { cf } from "@worker/api/plugins/cf";
import { Elysia } from "elysia";
import { ThingsSettingsBody } from "./model";
import { SettingsService } from "./service";

export const settingsController = new Elysia({
  name: "controller.settings",
})
  .use(cf)
  .use(authMiniApp)

  .get("/api/settings/things", async ({ env, userId, status }) => {
    const result = await SettingsService.getThingsSettings(env, userId);
    if (!result.ok) return status(result.status, { error: result.error });
    return result.data;
  })

  .put(
    "/api/settings/things",
    async ({ env, userId, body, status }) => {
      const result = await SettingsService.updateThingsSettings(
        env,
        userId,
        body,
      );
      if (!result.ok) return status(result.status, { error: result.error });
      return result.data;
    },
    { body: ThingsSettingsBody },
  )

  .delete("/api/settings/things", async ({ env, userId }) => {
    await SettingsService.clearThingsSettings(env, userId);
    return { ok: true };
  });
