import type { Env } from "@worker/types";
import { trimTrailingSlashes } from "@worker/utils/string";

export const normalizeBaseUrl = (url: string): string => {
  return trimTrailingSlashes(url);
};

export const getWorkerBaseUrl = (env: Pick<Env, "WORKER_URL">): string => {
  return normalizeBaseUrl(env.WORKER_URL);
};
