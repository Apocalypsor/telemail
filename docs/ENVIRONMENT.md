# 环境变量与 Bindings

## Secrets

通过 `bun wrangler secret put <KEY>` 配置，本地 `.dev.vars` 也可以。按用途分组：

### 核心（必填）

| Secret                    | 说明                                                   |
| ------------------------- | ------------------------------------------------------ |
| `TELEGRAM_BOT_TOKEN`      | Telegram Bot Token                                     |
| `ADMIN_TELEGRAM_ID`       | 管理员 Telegram user ID，用于鉴权                      |
| `ADMIN_SECRET`            | 自定义密钥，HMAC 签名用（session cookie、邮件链接 token、MCP API key hash） |
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

### IMAP Forwarding（用 IMAP 实时收件时必填）

| Secret                | 说明                                                  |
| --------------------- | ----------------------------------------------------- |
| `IMAP_FORWARD_DOMAIN` | Cloudflare Email Routing 路由到 Worker 的收件域名，例如 `in.telemail.example.com` |

IMAP 账号的 host / port / username / password 由用户在 Mini App 里保存到 `accounts` 表。`IMAP_FORWARD_DOMAIN` 只用来生成每个账号的转发地址；用户把 iCloud / 邮箱服务的自动转发地址设为该地址后，Email Routing handler 会用转发邮件里的 `Message-ID` 触发 Worker 通过 IMAP 拉取原邮箱中的同一封邮件。

### LLM / AI 摘要（可选）

三个都配置后启用 AI 摘要 + 垃圾检测：

| Secret        | 说明                                              |
| ------------- | ------------------------------------------------- |
| `LLM_API_URL` | OpenAI Responses API base URL（含 `/v1`）         |
| `LLM_API_KEY` | LLM API key                                       |
| `LLM_MODEL`   | 模型名称（例如 `gpt-4o-mini`）                    |

调用走 `/v1/responses`，并使用流式 SSE 读取 `response.output_text.delta`。

### Mini App / Web 预览（可选）

| Secret                   | 说明                                                            |
| ------------------------ | --------------------------------------------------------------- |
| `TG_MINI_APP_SHORT_NAME` | BotFather `/newapp` 注册的 Mini App short name（群聊 deep link 用） |

`WORKER_URL` 属于核心必填项；Mini App 账号管理、OAuth callback、Outlook webhook subscription、邮件预览和提醒入口都会依赖它。`TG_MINI_APP_SHORT_NAME` 未配 → 私聊仍可用 Mini App 按钮；群聊只保留裸 web "👁 查看原文"链接，不显示 ⏰ 提醒入口。

### Things Cloud（可选）

每个用户在 Mini App 里单独保存 Things Cloud 邮箱 / 密码后，邮件提醒到期时会在后台推送创建一条 Things Today 任务。用户设备时区由 Mini App 请求自动上报并记录；推送失败只会上报 observability，不影响 Telemail 提醒分发。同一个 `user_timezone` 也用于每天本地 19:00 的晚间邮件摘要。

| Secret                    | 说明                                                      |
| ------------------------- | --------------------------------------------------------- |
| `THINGS_CLOUD_ENDPOINT`   | Things Cloud API endpoint override（调试用，默认官方 endpoint） |

用户 Things Cloud 凭据和 `user_timezone` 存储在 D1 `users` 表，API 不回显密码；每个用户的 Things app instance id 存在 KV。注意：Things Cloud 没有官方公开 REST API；这里使用的是 Things Cloud 同步协议的最小 create-task 路径。

## Cloudflare Bindings

`apps/worker/wrangler.jsonc` 里声明，`bun typegen:worker` 把类型同步到 `apps/worker/worker-configuration.d.ts`。

| Binding                 | 类型           | 用途                                                                 |
| ----------------------- | -------------- | -------------------------------------------------------------------- |
| `DB`                    | D1             | 账号 / 消息映射 / 提醒 / 用户 / 失败邮件                             |
| `EMAIL_KV`              | KV             | access_token 缓存、消息去重、OAuth state、IMAP folder cache、预览 HTML（7 天 TTL） |
| `EMAIL_QUEUE`           | Queue          | 邮件处理队列（max_batch_size=5, max_retries=3, max_concurrency=3）   |
| `TELEGRAM_RATE_LIMITER` | Durable Object | Telegram API 写请求限流闸门；Queue 遇到 TG 429 时按 retry_after 延迟重试 |
| `OBS_SERVICE`           | Service        | 错误上报到 [workers-observability-hub](https://www.npmjs.com/package/workers-observability-hub) |

## Cron Triggers

`"triggers": { "crons": ["* * * * *"] }` —— 每分钟一次，scheduled tasks 各自声明 `shouldRun` 条件：

- **每分钟**：分发到期的 Mini App 提醒
- **每 15 分钟**：按用户本地时区检查是否到 19:00，发送未读 / 垃圾邮件摘要（都为 0 时跳过；非零列表会附 Mini App 入口）
- **每小时**（`minute === 0`）：重试失败的 LLM 摘要
- **每天 UTC 0 点**（额外）：为所有已授权账号续订推送通知（Gmail watch / Outlook Graph subscription）

## D1 Schema

用户可见的表：

- `accounts` —— 每个邮箱账号（`type`、`email`、`chat_id`、可选 `topic_id`、`refresh_token`、IMAP credentials / forward token 等）
- `message_map` —— `emailMessageId` ↔ `(tg_chat_id, tg_message_id, tg_thread_id)`，幂等去重用
- `reminders` —— Mini App 设的提醒，可选记录推送到 Things Cloud 的 task UUID
- `users` —— Telegram 用户记录（`approved` 状态控制访问 Mini App、web 工具页 `/preview` / `/junk-check` 与 `/api/mcp`），以及可选的 per-user Things Cloud 设置和 MCP API key hash
- `failed_emails` —— LLM / queue 处理失败的邮件，cron 批量重试
