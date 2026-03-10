-- 失败邮件记录（LLM 摘要生成失败时保存，管理员可手动重试）
CREATE TABLE failed_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  gmail_message_id TEXT NOT NULL,
  tg_chat_id TEXT NOT NULL,
  tg_message_id INTEGER NOT NULL,
  is_caption INTEGER NOT NULL DEFAULT 0,
  subject TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(gmail_message_id, tg_message_id)
);
