import type {
  AccountDetailResponse,
  AccountListResponse,
  AccountMutationResponse,
  CreateOAuthAccountResponse,
} from "./model";

export type AccountsResult =
  | { ok: true; data: AccountListResponse }
  | { ok: false; status: number; error: string };

export type AccountMutationResult =
  | { ok: true; data: AccountMutationResponse }
  | { ok: false; status: number; error: string };

export type AccountDetailResult =
  | { ok: true; data: AccountDetailResponse }
  | { ok: false; status: number; error: string };

export type CreateOAuthAccountResult =
  | { ok: true; data: CreateOAuthAccountResponse }
  | { ok: false; status: number; error: string };
