-- Add telegram_user_id column to bind accounts to Telegram users
ALTER TABLE accounts ADD COLUMN telegram_user_id TEXT;
