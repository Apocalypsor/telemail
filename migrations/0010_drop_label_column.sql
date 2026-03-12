-- Migration: Drop label column from accounts table (feature removed).
CREATE TABLE accounts_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'gmail',
    email TEXT,
    chat_id TEXT NOT NULL,
    refresh_token TEXT,
    history_id TEXT,
    telegram_user_id TEXT,
    imap_host TEXT,
    imap_port INTEGER,
    imap_secure INTEGER,
    imap_user TEXT,
    imap_pass TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO accounts_new SELECT id, type, email, chat_id, refresh_token, history_id, telegram_user_id, imap_host, imap_port, imap_secure, imap_user, imap_pass, created_at, updated_at FROM accounts;

DROP TABLE accounts;
ALTER TABLE accounts_new RENAME TO accounts;

CREATE UNIQUE INDEX idx_accounts_gmail_email ON accounts (email)
    WHERE type = 'gmail' AND email IS NOT NULL;
