-- Per-user MCP API keys. Only the HMAC hash is stored; the plain key is
-- returned once by the bot when generated.
ALTER TABLE users ADD COLUMN mcp_api_key_hash TEXT;
ALTER TABLE users ADD COLUMN mcp_api_key_created_at INTEGER;
CREATE UNIQUE INDEX idx_users_mcp_api_key_hash ON users(mcp_api_key_hash);
