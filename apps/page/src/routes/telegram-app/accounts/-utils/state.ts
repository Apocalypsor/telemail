import type { CreateOAuthAccountBody } from "@worker/api/modules/accounts/model";

interface BusyMutations {
  authUrlMut: { isPending: boolean; variables?: number };
  renewMut: { isPending: boolean; variables?: number };
  chatMut: { isPending: boolean; variables?: { accountId: number } };
  disabledMut: { isPending: boolean; variables?: { accountId: number } };
  ownerMut: { isPending: boolean; variables?: { accountId: number } };
  archiveMut: { isPending: boolean; variables?: { accountId: number } };
  deleteMut: { isPending: boolean; variables?: number };
}

export const isOAuthAccountType = (
  value: "gmail" | "outlook" | "imap",
): value is CreateOAuthAccountBody["type"] => {
  return value === "gmail" || value === "outlook";
};

export const currentBusyAccountId = ({
  authUrlMut,
  renewMut,
  chatMut,
  disabledMut,
  ownerMut,
  archiveMut,
  deleteMut,
}: BusyMutations): number | null => {
  if (authUrlMut.isPending) return authUrlMut.variables ?? null;
  if (renewMut.isPending) return renewMut.variables ?? null;
  if (chatMut.isPending) return chatMut.variables?.accountId ?? null;
  if (disabledMut.isPending) return disabledMut.variables?.accountId ?? null;
  if (ownerMut.isPending) return ownerMut.variables?.accountId ?? null;
  if (archiveMut.isPending) return archiveMut.variables?.accountId ?? null;
  if (deleteMut.isPending) return deleteMut.variables ?? null;
  return null;
};
