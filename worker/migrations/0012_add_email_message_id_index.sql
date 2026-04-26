-- Add unique index on (account_id, email_message_id) to prevent duplicate email delivery
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_map_email_unique ON message_map (account_id, email_message_id);
