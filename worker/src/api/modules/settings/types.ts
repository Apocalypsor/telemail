import type { ThingsSettingsResponse } from "./model";

export type ThingsSettingsResult =
  | {
      ok: true;
      data: ThingsSettingsResponse;
    }
  | {
      ok: false;
      status: 404;
      error: string;
    };

export type UpdateThingsSettingsResult =
  | ThingsSettingsResult
  | {
      ok: false;
      status: 400;
      error: string;
    };
