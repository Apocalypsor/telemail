-- Migration: create message_map table for Telegram ↔ Gmail message mapping
CREATE TABLE IF NOT EXISTS message_map (
    tg_message_id INTEGER NOT NULL,
    tg_chat_id TEXT NOT NULL,
    gmail_message_id TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    starred INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (tg_chat_id, tg_message_id)
);
