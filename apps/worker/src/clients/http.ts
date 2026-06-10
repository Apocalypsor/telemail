import ky from "ky";

/** 全局 HTTP 客户端，使用 ky 默认 retry（limit 2，自动处理 429 等） */
export const http = ky.create({});

export const httpErrorDataToText = (data: unknown): string => {
  if (typeof data === "string") return data;
  if (data === undefined || data === null) return "";

  try {
    return JSON.stringify(data) ?? String(data);
  } catch {
    return String(data);
  }
};
