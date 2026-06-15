ALTER TABLE accounts ADD COLUMN imap_forward_token TEXT;

UPDATE accounts
SET imap_forward_token = lower(hex(randomblob(12)))
WHERE type = 'imap' AND imap_forward_token IS NULL;

CREATE UNIQUE INDEX idx_accounts_imap_forward_token
  ON accounts(imap_forward_token);
