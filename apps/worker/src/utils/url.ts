import type { Env } from "@worker/types";

export const normalizeBaseUrl = (url: string): string => {
  return url.replace(/\/$/, "");
};

export const getWorkerBaseUrl = (env: Pick<Env, "WORKER_URL">): string => {
  return normalizeBaseUrl(env.WORKER_URL);
};
