-- Things Cloud is configured per Telegram user. NULL means Things push is disabled.
ALTER TABLE users ADD COLUMN things_cloud_email TEXT;
ALTER TABLE users ADD COLUMN things_cloud_password TEXT;
ALTER TABLE users ADD COLUMN user_timezone TEXT;
