export const assertImapMutationSucceeded = (
  result: unknown,
  accountId: number,
  action: string,
): void => {
  if (!result) {
    throw new Error(`[Account ${accountId}] ${action}: IMAP command failed`);
  }
};
