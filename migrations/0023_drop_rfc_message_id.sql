-- Drop rfc_message_id column from message_map.
-- IMAP provider now uses RFC 822 Message-Id as email_message_id directly —
-- middleware's wire API is fully Message-Id based, so the separate column is redundant.
ALTER TABLE message_map DROP COLUMN rfc_message_id;
