-- Migration: support Telegram forum topics for mail delivery.
--
-- accounts.topic_id is the optional mail delivery topic for that account.
-- message_map.tg_thread_id records where the Telegram message was posted so
-- preview/deep-link code can reconstruct topic-aware links later.
ALTER TABLE accounts ADD COLUMN topic_id INTEGER;
ALTER TABLE message_map ADD COLUMN tg_thread_id INTEGER;
