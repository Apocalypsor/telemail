import { hmacSha256Hex } from "@worker/utils/hash";

export const MCP_API_KEY_PREFIX = "tmcp_";

/** 生成用户可粘贴进 agent 配置的 MCP API key。明文只展示一次。 */
export const generateMcpApiKey = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${MCP_API_KEY_PREFIX}${bytesToHex(bytes)}`;
};

/** 存库前做 keyed hash，避免 DB 泄露后能离线直接拿 key 调 MCP。 */
export const hashMcpApiKey = async (
  secret: string,
  apiKey: string,
): Promise<string> => {
  return hmacSha256Hex(secret, `mcp-api-key:${apiKey}`);
};

export const extractBearerApiKey = (header: string | null): string | null => {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.startsWith(MCP_API_KEY_PREFIX) ? token : null;
};

const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};
