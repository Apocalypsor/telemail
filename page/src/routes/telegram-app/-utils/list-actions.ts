import { api } from "@page/api/client";
import { MAIL_LIST_TYPES } from "@page/constants";
import type { MailListType } from "@worker/api/modules/miniapp/model";

interface BulkAction {
  label: string;
  run: () => Promise<{ success: number; failed: number }>;
  confirmText: string;
  danger?: boolean;
}

export const isMailListType = (s: string): s is MailListType => {
  return (MAIL_LIST_TYPES as readonly string[]).includes(s);
};

export const BULK_ACTIONS: Partial<Record<MailListType, BulkAction>> = {
  unread: {
    label: "✓ 全部已读",
    run: async () => {
      const { data, error } =
        await api.api["mini-app"]["mark-all-as-read"].post();
      if (error) throw error;
      return data;
    },
    confirmText: "把所有未读邮件标记为已读？",
  },
  junk: {
    label: "🗑 清空垃圾",
    run: async () => {
      const { data, error } =
        await api.api["mini-app"]["trash-all-junk"].post();
      if (error) throw error;
      return data;
    },
    confirmText: "清空所有账号的垃圾邮件？此操作不可撤销。",
    danger: true,
  },
};
