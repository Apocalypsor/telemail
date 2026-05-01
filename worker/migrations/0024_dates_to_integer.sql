-- Migration: Convert all timestamp columns from TEXT to INTEGER (Unix epoch ms).
--
-- 背景：SQLite 没有原生 DATETIME 类型，原 schema 全部 TEXT + datetime('now') ——
--   - 字符串比较 / 索引扫描比 INTEGER 慢
--   - datetime('now') 输出 "YYYY-MM-DD HH:MM:SS"（无 T 无 Z），而 dt.toISOString()
--     是严格 ISO 8601，同一列两种格式混存
--   - JS 端 Date.now() / dt.getTime() / new Date(ms) 直接对应 INTEGER 毫秒级 epoch
--
-- 5 张表 9 列：
--   accounts.created_at, accounts.updated_at
--   users.last_login_at, users.created_at
--   message_map.created_at
--   failed_emails.created_at
--   reminders.remind_at, reminders.sent_at, reminders.created_at
--
-- 转换公式：CAST(strftime('%s', col) AS INTEGER) * 1000
--   - strftime 接受 "YYYY-MM-DD HH:MM:SS" 和 "YYYY-MM-DDTHH:MM:SS.SSSZ" 两种格式
--   - NULL 透传 NULL（NULL * 1000 = NULL），sent_at 可空字段保持语义
--   - 现有数据从秒级 epoch 升毫秒级（× 1000）；亚秒精度反正原本就丢了
--
-- DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000) —— 用 strftime 兼容老
-- SQLite，等价于 `unixepoch() * 1000`（SQLite 3.38+）。
--
-- 模式延续 0002 / 0010 的 rebuild 套路：CREATE _new + INSERT...SELECT + DROP + RENAME。

-- ─── accounts ──────────────────────────────────────────────────────────────
CREATE TABLE accounts_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'gmail',
    email TEXT,
    chat_id TEXT NOT NULL,
    refresh_token TEXT,
    telegram_user_id TEXT,
    imap_host TEXT,
    imap_port INTEGER,
    imap_secure INTEGER,
    imap_user TEXT,
    imap_pass TEXT,
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
    updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
    history_id TEXT,
    archive_folder TEXT,
    archive_folder_name TEXT,
    disabled INTEGER NOT NULL DEFAULT 0
);

INSERT INTO accounts_new (
    id, type, email, chat_id, refresh_token, telegram_user_id,
    imap_host, imap_port, imap_secure, imap_user, imap_pass,
    created_at, updated_at,
    history_id, archive_folder, archive_folder_name, disabled
)
SELECT
    id, type, email, chat_id, refresh_token, telegram_user_id,
    imap_host, imap_port, imap_secure, imap_user, imap_pass,
    CAST(strftime('%s', created_at) AS INTEGER) * 1000,
    CAST(strftime('%s', updated_at) AS INTEGER) * 1000,
    history_id, archive_folder, archive_folder_name, disabled
FROM accounts;

DROP TABLE accounts;
ALTER TABLE accounts_new RENAME TO accounts;

-- ─── users ────────────────────────────────────────────────────────────────
CREATE TABLE users_new (
    telegram_id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT,
    username TEXT,
    photo_url TEXT,
    last_login_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
    approved INTEGER NOT NULL DEFAULT 0
);

INSERT INTO users_new (
    telegram_id, first_name, last_name, username, photo_url,
    last_login_at, created_at, approved
)
SELECT
    telegram_id, first_name, last_name, username, photo_url,
    CAST(strftime('%s', last_login_at) AS INTEGER) * 1000,
    CAST(strftime('%s', created_at) AS INTEGER) * 1000,
    approved
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- ─── message_map ──────────────────────────────────────────────────────────
CREATE TABLE message_map_new (
    tg_message_id INTEGER NOT NULL,
    tg_chat_id TEXT NOT NULL,
    email_message_id TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
    short_summary TEXT,
    PRIMARY KEY (tg_chat_id, tg_message_id)
);

INSERT INTO message_map_new (
    tg_message_id, tg_chat_id, email_message_id, account_id,
    created_at, short_summary
)
SELECT
    tg_message_id, tg_chat_id, email_message_id, account_id,
    CAST(strftime('%s', created_at) AS INTEGER) * 1000,
    short_summary
FROM message_map;

DROP TABLE message_map;
ALTER TABLE message_map_new RENAME TO message_map;

-- 索引随 DROP TABLE 一起被清，重建 0012 那个唯一索引
CREATE UNIQUE INDEX idx_message_map_email_unique ON message_map (account_id, email_message_id);

-- ─── failed_emails ────────────────────────────────────────────────────────
CREATE TABLE failed_emails_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    email_message_id TEXT NOT NULL,
    tg_chat_id TEXT NOT NULL,
    tg_message_id INTEGER NOT NULL,
    is_caption INTEGER NOT NULL DEFAULT 0,
    subject TEXT,
    error_message TEXT,
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
    UNIQUE(email_message_id, tg_message_id)
);

INSERT INTO failed_emails_new (
    id, account_id, email_message_id, tg_chat_id, tg_message_id,
    is_caption, subject, error_message, created_at
)
SELECT
    id, account_id, email_message_id, tg_chat_id, tg_message_id,
    is_caption, subject, error_message,
    CAST(strftime('%s', created_at) AS INTEGER) * 1000
FROM failed_emails;

DROP TABLE failed_emails;
ALTER TABLE failed_emails_new RENAME TO failed_emails;

-- ─── reminders ────────────────────────────────────────────────────────────
CREATE TABLE reminders_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    remind_at INTEGER NOT NULL,
    sent_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
    account_id INTEGER,
    email_message_id TEXT,
    email_subject TEXT,
    tg_chat_id TEXT,
    tg_message_id INTEGER
);

INSERT INTO reminders_new (
    id, telegram_user_id, text, remind_at, sent_at, created_at,
    account_id, email_message_id, email_subject, tg_chat_id, tg_message_id
)
SELECT
    id, telegram_user_id, text,
    CAST(strftime('%s', remind_at) AS INTEGER) * 1000,
    CAST(strftime('%s', sent_at) AS INTEGER) * 1000,
    CAST(strftime('%s', created_at) AS INTEGER) * 1000,
    account_id, email_message_id, email_subject, tg_chat_id, tg_message_id
FROM reminders;

DROP TABLE reminders;
ALTER TABLE reminders_new RENAME TO reminders;

-- 索引重建（0021 的两个）
CREATE INDEX idx_reminders_due ON reminders(sent_at, remind_at);
CREATE INDEX idx_reminders_user ON reminders(telegram_user_id);
