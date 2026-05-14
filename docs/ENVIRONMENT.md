# 环境变量与 Bindings

## Secrets

通过 `bun wrangler secret put <KEY>` 配置，本地 `.dev.vars` 也可以。按用途分组：

### 核心（必填）

| Secret                    | 说明                                                   |
| ------------------------- | ------------------------------------------------------ |
| `TELEGRAM_BOT_TOKEN`      | Telegram Bot Token                                     |
| `ADMIN_TELEGRAM_ID`       | 管理员 Telegram user ID，用于鉴权                      |
| `ADMIN_SECRET`            | 自定义密钥，HMAC 签名用（session cookie、邮件链接 token） |
| `TELEGRAM_WEBHOOK_SECRET` | 自定义密钥，验证 Telegram webhook                      |
| `WORKER_URL`              | Worker + Pages 对外 URL，例如 `https://telemail.dov.moe`；OAuth callback、Outlook webhook、邮件查看 / 提醒按钮都会用 |

### Gmail（用 Gmail 时必填）

| Secret                | 说明                                                   |
| --------------------- | ------------------------------------------------------ |
| `GMAIL_CLIENT_ID`     | Google OAuth2 Client ID（所有 Gmail 账号共享）         |
| `GMAIL_CLIENT_SECRET` | Google OAuth2 Client Secret                            |
| `GMAIL_PUBSUB_TOPIC`  | Pub/Sub topic 全名，例如 `projects/my-project/topics/gmail-push` |
| `GMAIL_PUSH_SECRET`   | 自定义密钥，附加在 push endpoint URL 上验证 Pub/Sub push |

### Outlook（用 Outlook 时必填）

| Secret              | 说明                                              |
| ------------------- | ------------------------------------------------- |
| `MS_CLIENT_ID`      | Microsoft Entra ID Application (client) ID        |
| `MS_CLIENT_SECRET`  | Microsoft Entra ID Client Secret                  |
| `MS_WEBHOOK_SECRET` | 自定义密钥，验证 Microsoft Graph webhook 签名     |

### IMAP（用 IMAP 时必填）

| Secret               | 说明                                                                |
| -------------------- | ------------------------------------------------------------------- |
| `IMAP_BRIDGE_URL`    | IMAP Bridge 中间件 URL（middleware 部署见 [DEPLOYMENT.md §6.4](./DEPLOYMENT.md)） |
| `IMAP_BRIDGE_SECRET` | IMAP Bridge 共享密钥（Bearer），跟 middleware `.env` 的 `BRIDGE_SECRET` 一致 |

### LLM / AI 摘要（可选）

三个都配置后启用 AI 摘要 + 垃圾检测：

| Secret        | 说明                                              |
| ------------- | ------------------------------------------------- |
| `LLM_API_URL` | OpenAI-compatible API base URL（含 `/v1`）        |
| `LLM_API_KEY` | LLM API key                                       |
| `LLM_MODEL`   | 模型名称（例如 `gpt-4o-mini`）                    |

兼容 OpenAI、Groq、OpenRouter、vLLM、Ollama（`http://host:11434/v1`）等任何提供 `/chat/completions` 端点的服务。

### Mini App / Web 预览（可选）

| Secret                   | 说明                                                            |
| ------------------------ | --------------------------------------------------------------- |
| `TG_MINI_APP_SHORT_NAME` | BotFather `/newapp` 注册的 Mini App short name（群聊 deep link 用） |

`WORKER_URL` 属于核心必填项；Bot 管理面板、OAuth callback、Outlook webhook subscription、邮件预览和提醒入口都会依赖它。`TG_MINI_APP_SHORT_NAME` 未配 → 私聊仍可用 Mini App 按钮；群聊只保留裸 web "👁 查看原文"链接，不显示 ⏰ 提醒入口。

### Things Cloud（可选）

每个用户在 Mini App 里单独保存 Things Cloud 邮箱 / 密码后，邮件提醒到期时会在后台推送创建一条 Things Today 任务。用户设备时区由 Mini App 请求自动上报并记录；推送失败只会上报 observability，不影响 Telemail 提醒分发。

| Secret                    | 说明                                                      |
| ------------------------- | --------------------------------------------------------- |
| `DEFAULT_USER_TIMEZONE`   | 未记录用户设备时区时的 IANA 时区 fallback，默认 `UTC` |
| `THINGS_CLOUD_ENDPOINT`   | Things Cloud API endpoint override（调试用，默认官方 endpoint） |

用户 Things Cloud 凭据和 `user_timezone` 存储在 D1 `users` 表，API 不回显密码；每个用户的 Things app instance id 存在 KV。注意：Things Cloud 没有官方公开 REST API；这里使用的是 Things Cloud 同步协议的最小 create-task 路径。

## Cloudflare Bindings

`worker/wrangler.jsonc` 里声明，`bun typegen:worker` 把类型同步到 `worker/worker-configuration.d.ts`。

| Binding       | 类型    | 用途                                                                 |
| ------------- | ------- | -------------------------------------------------------------------- |
| `DB`          | D1      | 账号 / 消息映射 / 提醒 / 用户 / 失败邮件                             |
| `EMAIL_KV`    | KV      | access_token 缓存、消息去重、OAuth state、预览 HTML（7 天 TTL）      |
| `EMAIL_QUEUE` | Queue   | 邮件处理队列（max_batch_size=5, max_retries=3, max_concurrency=3）   |
| `OBS_SERVICE` | Service | 错误上报到 [workers-observability-hub](https://www.npmjs.com/package/workers-observability-hub) |

## Cron Triggers

`"triggers": { "crons": ["* * * * *"] }` —— 每分钟一次，`worker/src/handlers/scheduled/index.ts` 内部按 `getUTCMinutes() === 0` 区分轻 / 重任务：

- **每分钟**：分发到期的 Mini App 提醒
- **每小时**（`minute === 0`）：检查 IMAP Bridge 健康、重试失败的 LLM 摘要
- **每天 UTC 0 点**（额外）：为所有已授权账号续订推送通知（Gmail watch / Outlook Graph subscription）

## D1 Schema

用户可见的表：

- `accounts` —— 每个邮箱账号（`type`、`email`、`chat_id`、`refresh_token` 加密等）
- `message_map` —— `emailMessageId` ↔ `(tg_chat_id, tg_message_id)`，幂等去重用
- `reminders` —— Mini App 设的提醒，可选记录推送到 Things Cloud 的 task UUID
- `users` —— 登录过 Telegram Login Widget 的用户（`approved` 状态控制访问 web 工具页 `/preview` / `/junk-check`），以及可选的 per-user Things Cloud 设置
- `failed_emails` —— LLM / queue 处理失败的邮件，cron 批量重试
