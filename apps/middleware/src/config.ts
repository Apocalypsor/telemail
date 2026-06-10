const requireEnv = (name: string): string => {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
};

export const config = {
  /** 与 Telemail Worker 共享的密钥，双向鉴权 */
  bridgeSecret: requireEnv("BRIDGE_SECRET"),
  /** Telemail Worker 的 URL，例如 https://telemail.xxx.workers.dev */
  workerUrl: requireEnv("TELEMAIL_URL").replace(/\/$/, ""),
  /** 本地 HTTP 监听端口 */
  port: Number.parseInt(process.env.PORT ?? "3000", 10),
};
