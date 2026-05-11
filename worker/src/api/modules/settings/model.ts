import { t, type UnwrapSchema } from "elysia";

export const ThingsSettingsBody = t.Object({
  email: t.Optional(t.String({ maxLength: 320 })),
  password: t.Optional(t.String({ maxLength: 2048 })),
});
export type ThingsSettingsBody = UnwrapSchema<typeof ThingsSettingsBody>;

export const ThingsSettingsResponse = t.Object({
  enabled: t.Boolean(),
  email: t.Union([t.String(), t.Null()]),
  user_timezone: t.Union([t.String(), t.Null()]),
  hasPassword: t.Boolean(),
});
export type ThingsSettingsResponse = UnwrapSchema<
  typeof ThingsSettingsResponse
>;
