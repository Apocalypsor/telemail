import { api } from "@page/api/client";

export type MailContentFolder = "inbox" | "junk" | "archive";

export interface MailContentQueryInput {
  emailMessageId: string;
  accountId: number;
  token: string;
  folder?: MailContentFolder;
}

export function mailContentQueryOptions({
  emailMessageId,
  accountId,
  token,
  folder,
}: MailContentQueryInput) {
  return {
    queryKey: ["mail-preview", emailMessageId, accountId, folder],
    queryFn: async () => {
      const { data, error } = await api.api.mail({ id: emailMessageId }).get({
        query: {
          accountId: String(accountId),
          t: token,
          folder,
        },
      });
      if (error) throw error;
      return data;
    },
  };
}
