import type {
  AccountDetailResponse,
  AccountListResponse,
  AccountMutationResponse,
  ArchiveLabelOption,
  CreateOAuthAccountResponse,
} from "@worker/api/modules/accounts/model";

export const ACCOUNTS_QUERY_KEY = (scope: "own" | "all") =>
  ["accounts", scope] as const;

export const ACCOUNT_DETAIL_QUERY_KEY = (id: string) =>
  ["accounts", "detail", id] as const;

export const unwrapAccountList = (
  data: AccountListResponse | { error: string } | null,
): AccountListResponse => {
  if (!data) throw new Error("账号加载失败");
  if ("error" in data) throw new Error(data.error);
  return data;
};

export const unwrapAccountDetail = (
  data: AccountDetailResponse | { error: string } | null,
): AccountDetailResponse => {
  if (!data) throw new Error("账号加载失败");
  if ("error" in data) throw new Error(data.error);
  return data;
};

export const unwrapOAuthResponse = (
  data: CreateOAuthAccountResponse | { error: string } | null,
): CreateOAuthAccountResponse => {
  if (!data) throw new Error("授权链接生成失败");
  if ("error" in data) throw new Error(data.error);
  return data;
};

export const unwrapMutationResponse = (
  data: AccountMutationResponse | { error: string } | null,
): AccountMutationResponse => {
  if (!data) throw new Error("账号创建失败");
  if ("error" in data) throw new Error(data.error);
  return data;
};

export const unwrapArchiveLabels = (
  data: { labels: ArchiveLabelOption[] } | { error: string } | null,
): { labels: ArchiveLabelOption[] } => {
  if (!data) throw new Error("标签加载失败");
  if ("error" in data) throw new Error(data.error);
  return data;
};
