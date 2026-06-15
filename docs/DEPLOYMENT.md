# 部署

把 Telemail 部署起来要经过这些阶段：外部服务（GCP / MS Entra）→ Cloudflare 资源（D1 / KV / Queue）→ Worker + Pages → Telegram webhook + Mini App 注册。

## 1. 前置条件

- [Cloudflare](https://cloudflare.com) 账号
- [Telegram Bot](https://core.telegram.org/bots#how-do-i-create-a-bot) token（`@BotFather` 创建）
- 接收消息的 Telegram Chat ID（每个邮箱账号可配置不同的 Chat）
- **Gmail**：启用了 Gmail API 的 [Google Cloud](https://console.cloud.google.com) 项目
- **Outlook**：[Microsoft Entra ID](https://entra.microsoft.com) 应用注册
- **IMAP**：邮箱服务支持 IMAP 读取，并能设置自动转发到 Cloudflare Email Routing 地址

安装依赖：

```sh
bun install
```

根目录 `bunfig.toml` 要求依赖版本至少发布满 14 天，CI 的 `bun install --frozen-lockfile` 也会沿用这条规则。

## 2. Google Cloud（Gmail）

### 2.1 启用 Gmail API

1. 打开 [Google Cloud Console](https://console.cloud.google.com)
2. 创建或选择一个项目
3. **APIs & Services → Library** → 搜索 **Gmail API** → 启用

### 2.2 OAuth2 凭据

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. 应用类型选 **Web application**
3. Authorized redirect URIs 填 `https://YOUR_WORKER_DOMAIN/oauth/gmail/callback`
4. 记录 **Client ID** 和 **Client Secret**

### 2.3 Pub/Sub Topic + Subscription

```sh
# 创建 topic（所有 Gmail 账号共享同一个 topic）
gcloud pubsub topics create gmail-push

# 授权 Gmail 向此 topic 发布消息
gcloud pubsub topics add-iam-policy-binding gmail-push \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

# 部署 Worker 后，创建 push subscription（URL 中替换为你的 Worker 域名和密钥）
gcloud pubsub subscriptions create gmail-push-sub \
  --topic=gmail-push \
  --push-endpoint="https://YOUR_WORKER_DOMAIN/api/gmail/push?secret=YOUR_PUSH_SECRET" \
  --ack-deadline=30
```

## 3. Microsoft Entra ID（Outlook，可选）

1. [Microsoft Entra ID](https://entra.microsoft.com) → Applications → App registrations → **New registration**
2. 名称随意，账户类型选 **Accounts in any organizational directory and personal Microsoft accounts**
3. Redirect URI 添加 **Web** 类型：`https://YOUR_WORKER_DOMAIN/oauth/outlook/callback`
4. 注册后记下 **Application (client) ID**
5. **Certificates & secrets → New client secret** → 记下 Value
6. **API permissions → Add a permission → Microsoft Graph → Delegated permissions** → 勾选 `Mail.ReadWrite`、`offline_access`、`User.Read`

## 4. Cloudflare 资源

> wrangler 装在仓库根 devDeps，所以 `bun wrangler …` 在仓库任何地方都能跑。`wrangler.jsonc` 在 `apps/worker/` 下，wrangler 默认从 cwd 找它，所以下面的 `wrangler d1` / `wrangler kv` / `wrangler queues` / `wrangler secret` 命令都建议在 `apps/worker/` 目录跑。或者从根加 `--config apps/worker/wrangler.jsonc`。
>
> ⚠️ **`apps/worker/wrangler.jsonc` 是 gitignored 的**，由 `apps/worker/wrangler.example.jsonc` 经 `envsubst` 生成（CF 账号专属 ID 不入库）。**首次本地 setup**：`cp apps/worker/wrangler.example.jsonc apps/worker/wrangler.jsonc` 然后把 `${D1_DATABASE_ID}` / `${KV_NAMESPACE_ID}` 替换成下面 §4.1 / §4.2 拿到的真实 ID。CI 自动走 envsubst（详见 §8.2）。

### 4.1 D1 数据库

```sh
bun wrangler d1 create gmail-tg-bridge
```

把返回的 `database_id` 填入 `apps/worker/wrangler.jsonc` 中 `d1_databases[0].database_id`（替换占位符 `${D1_DATABASE_ID}`），同时把这个 UUID 加到 GitHub repo secrets 里叫 `CF_D1_DATABASE_ID`（CI 用）。首次建库后从仓库根跑：

```sh
bun migrate:worker:remote
```

后续只要代码改动包含 `apps/worker/migrations/` 或 D1 schema 变化，也要在部署对应 Worker 版本前跑一次 `bun migrate:worker:remote`。`wrangler deploy` 不会自动执行 D1 migrations。

### 4.2 KV 命名空间

```sh
bun wrangler kv namespace create EMAIL_KV
```

返回的 `id` 填入 `apps/worker/wrangler.jsonc` 中 `kv_namespaces[0].id`（替换 `${KV_NAMESPACE_ID}`），同时加到 GitHub repo secrets 里叫 `CF_KV_NAMESPACE_ID`。用途：access_token 缓存、消息去重、OAuth state。

### 4.3 Queue

```sh
bun wrangler queues create gmail-tg-queue
```

`wrangler.jsonc` 中已经配好 producer / consumer 绑定。Queue 用于并发处理邮件，Telegram 429 会按 `retry_after` 延迟重试。

### 4.4 Durable Object

Telegram API 写请求的限流闸门由 `TELEGRAM_RATE_LIMITER` Durable Object 提供。`wrangler.jsonc` 已经声明 binding 和 migration；不需要手动 create，部署 Worker 时 Wrangler 会应用 Durable Object migration。

### 4.5 Secrets

所有 secret 的用途和"哪些必填 / 哪些可选"见 [ENVIRONMENT.md](./ENVIRONMENT.md)。最小集：

```sh
bun wrangler secret put TELEGRAM_BOT_TOKEN
bun wrangler secret put ADMIN_TELEGRAM_ID
bun wrangler secret put ADMIN_SECRET
bun wrangler secret put TELEGRAM_WEBHOOK_SECRET
bun wrangler secret put WORKER_URL              # https://YOUR_WORKER_DOMAIN
# Gmail
bun wrangler secret put GMAIL_CLIENT_ID
bun wrangler secret put GMAIL_CLIENT_SECRET
bun wrangler secret put GMAIL_PUBSUB_TOPIC
bun wrangler secret put GMAIL_PUSH_SECRET
```

`WORKER_URL` 不是敏感值，但 Mini App 账号管理、Gmail / Outlook 授权链接、Outlook webhook subscription、邮件查看 / 提醒按钮都会用它拼公开 URL；生产环境必须配置为最终同源域名。

可选：如果要覆盖 Things Cloud API endpoint，再配置：

```sh
bun wrangler secret put THINGS_CLOUD_ENDPOINT     # 调试用
```

Things Cloud 账号不是全局 Worker secret；每个用户在 Mini App 的 Things 设置页保存自己的邮箱 / 密码。用户设备时区会随 Mini App 请求自动记录，缺省固定 fallback 到 UTC。

如果要接 IMAP 实时转发，还要配置 Email Routing 收件域名：

```sh
bun wrangler secret put IMAP_FORWARD_DOMAIN  # 例如 in.telemail.example.com
```

`IMAP_FORWARD_DOMAIN` 不是敏感值，但用 secret / `.dev.vars` 配置可以避免把部署域名写进代码。每个 IMAP 账号会生成 `fwd-<token>@IMAP_FORWARD_DOMAIN`，用户把原邮箱自动转发到这个地址后，Worker 用 Email Routing 收到的 `Message-ID` 触发 IMAP 拉取原邮箱中的同一封邮件。

## 5. Worker 部署

如果本次发布包含 D1 schema / migrations 变更，先从仓库根应用远端迁移：

```sh
bun migrate:worker:remote
```

确认迁移成功后再部署 Worker：

```sh
bun deploy:worker
```

GitHub Actions 的 `deploy-worker` job 也只执行 `wrangler deploy`，不会自动跑 D1 migrations；用 CI 发版时同样需要先手动 apply，或在 workflow 里单独加 migration step。

### 5.1 设置 Telegram Webhook

```sh
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://YOUR_WORKER_DOMAIN/api/telegram/webhook?secret=YOUR_TELEGRAM_WEBHOOK_SECRET",
    "allowed_updates": ["message", "channel_post", "callback_query", "message_reaction", "message_reaction_count"]
  }'
```

- `message`：`/start` 等命令、群/私聊里的服务消息（pin cleanup 等）
- `channel_post`：频道里的服务消息（频道 post 走这个 update type，不走 `message`）
- `callback_query`：星标按钮点击
- `message_reaction` / `message_reaction_count`：emoji reaction（群组/频道）

Forum supergroup 可用作“General 操作区 + Inbox 邮件区”：把 bot 设为管理员并授予“管理话题”权限后，在 General topic 里发送 `/start`，bot 会创建 `Inbox` topic，并返回 Chat ID / Inbox Topic ID。群聊里打开 Mini App 菜单需要配置 `TG_MINI_APP_SHORT_NAME`。

> **注意**：邮件转发到**频道**时，Bot 需被设为频道管理员才能接收 reaction 事件。

## 6. Pages 部署（Mini App 前端 + web 工具页）

方案：同域 Workers Routes。前端 SPA 和 Worker 共享一个自定义域名，通过 Workers Routes 按路径分流：

- `example.com/api/*`、`/oauth/*` → Worker
- 其它（`/`、`/mail/*`、`/preview`、`/junk-check`、`/login`、`/telegram-app/*`）→ Pages

同源，零 CORS。

### 6.1 创建 Pages 项目

> 推荐用 Direct Upload + GitHub Actions 推（见下文 §8 CI/CD）。Pages 项目 Settings → Builds & deployments 里的 "Build with Git" 保持关闭，避免 Actions 推送和 Cloudflare 自动 build 双跑撞车。

首次创建 Pages 项目（用 wrangler 一行就行）：

```sh
bun build:page
bun wrangler pages project create telemail-web --production-branch=main
bun wrangler pages deploy apps/page/dist --project-name=telemail-web --branch=main
```

或者在 Cloudflare 控制台手动创建。**项目名约定**：

| 资源 | CF 项目名 | 来源 |
| --- | --- | --- |
| Worker | `telemail` | `apps/worker/wrangler.jsonc` 里的 `name` 字段 |
| Pages | `telemail-web` | `.github/workflows/ci.yml` 里 `--project-name` |

要改 Pages 项目名的话，workflow 文件里 `deploy-page` / `preview-page` 两处 `--project-name` 都要同步改。

绑定自定义域名（和 Worker 同域）：Pages 项目 → Custom domains → 加自定义域。

### 6.2 配置 Workers Routes

Workers & Pages → 你的 Worker → Settings → Triggers → Routes，只保留：

```
example.com/api/*
example.com/oauth/*
```

其它路径自然落到 Pages。

### 6.3 配置 Bot / Mini App

BotFather：

- `/setdomain` 设为 `example.com`
- `/newapp` 注册 Mini App，Web App URL 填 `https://example.com/telegram-app`，short name 记下来

确认 §4.5 的 `WORKER_URL` 已经是最终同源域名；`TG_MINI_APP_SHORT_NAME` 填刚才的 short name：

```sh
bun wrangler secret put TG_MINI_APP_SHORT_NAME
```

## 6.4 配置 IMAP Email Routing（可选，仅当要接 IMAP 账号时）

IMAP 账号不再需要独立桥接服务。Worker 直接按需连接用户的 IMAP server；Cloudflare Email Routing 只提供实时 push signal。

### 准备

- 在 Cloudflare 上选择一个收件域名，例如 `in.telemail.example.com`。
- 启用 Email Routing，并把 catch-all 或 `fwd-*` 地址路由到 `telemail` Worker。
- 在 Worker secrets / `.dev.vars` 里配置同一个域名：

```sh
bun wrangler secret put IMAP_FORWARD_DOMAIN
```

### 通信模型

1. 用户在 Mini App 创建 IMAP 账号，保存 IMAP host / port / username / password。
2. Mini App 账号详情显示 `fwd-<token>@IMAP_FORWARD_DOMAIN`。
3. 用户在 iCloud / 邮箱服务里把自动转发目标设置为该地址。
4. Cloudflare Email Routing 调用 Worker `email()` handler。
5. Worker 从转发邮件 envelope recipient 解析账号，从 headers 取 RFC `Message-ID`，入队。
6. Queue consumer 通过 IMAP `SEARCH HEADER Message-ID` 找到原邮箱里的邮件，再拉取 raw MIME 投递到 Telegram。

未知转发地址和禁用账号会被 Worker 拒收，避免 catch-all 变成垃圾邮件入口。转发邮件本身的正文不会写入 D1；邮件正文仍由 IMAP 从原邮箱实时读取。

## 7. 添加邮箱账号

通过 Telegram Mini App 管理：

1. 向 Bot 发送 `/start` → **账号管理** 打开 Mini App
2. 在 Mini App 里选择账号类型（Gmail / Outlook / IMAP），填写 Chat ID 和必要配置
3. Gmail / Outlook 需完成 OAuth 授权（先确保 `WORKER_URL` 已配置，且 OAuth redirect URI 指向同一域名）；IMAP 需填写服务器信息和密码，并把邮箱自动转发到账号详情显示的转发地址
4. 授权或转发设置完成后，新邮件实时推送到 Telegram

管理员可从 `/start` → **全局管理** → **用户管理** 打开 Mini App 审批、撤回或删除用户。

后续 Cron Trigger 会自动维护：每分钟分发到期提醒，并按用户本地时区在 19:00 发送未读 / 垃圾邮件摘要（非零列表会附 Mini App 入口）；每小时重试失败的 LLM 摘要；每天凌晨（UTC 0 点）自动续订所有账号的推送通知。

## 8. CI/CD（GitHub Actions）

`.github/workflows/ci.yml` 一个 workflow。`changes` job 用 `dorny/paths-filter` 输出 `worker` / `page` 两个 boolean，后续 deploy / preview job 按这些 flag + 事件类型决定跑不跑。Markdown 变更会跑 CI，但不会触发 Worker / Pages deploy。CI 验证拆成 Biome、typecheck、page build 三个并行 job，再由 `ci` 聚合 job 供部署链路依赖。

### 8.1 行为矩阵

| 触发 | 跑什么 |
| --- | --- |
| `pull_request` | CI 总跑（Biome / typecheck / build page 并行）<br/>`apps/worker/**` 非 Markdown 变更 → `preview-worker`（`wrangler versions upload`，输出 preview URL，不接生产流量）<br/>`apps/page/**` 非 Markdown 变更 → `preview-page`（`wrangler pages deploy --branch=<head-ref>`）<br/>**`preview-comment`** sticky comment 把 URL / 状态贴到 PR |
| `push` to `main` | CI + 按 filter 自动部署：worker `bun deploy:worker`、pages `wrangler pages deploy --branch=main`。注意：Worker deploy 不自动 apply D1 migrations，schema 变更需先跑 `bun migrate:worker:remote` |
| `workflow_dispatch` on `main` | **强制**Worker / Pages deploy 全跑（绕过 path filter）—— 适合 hotfix 重发 |
| `workflow_dispatch` on 其他 branch | 仅 CI |

Path filter 故意**不含** `bun.lock`：免得改个 lockfile 牵连所有 workspace 重部署。Markdown 只影响 CI，不触发 deploy。根 `package.json` 同时影响 worker / page（共享 devDeps）。

### 8.2 配置 Repo Secrets

GitHub repo → **Settings → Secrets and variables → Actions** 加：

| Secret | 来源 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | CF dashboard → My Profile → API Tokens → Create。权限至少：Account → Workers Scripts:Edit + Pages:Edit + Workers KV:Edit + D1:Edit + Queues:Edit |
| `CLOUDFLARE_ACCOUNT_ID` | CF dashboard 任意 Worker 详情页右下角 |
| `CF_D1_DATABASE_ID` | `bun wrangler d1 create gmail-tg-bridge` 返回的 UUID（也填入本地 `apps/worker/wrangler.jsonc`） |
| `CF_KV_NAMESPACE_ID` | `bun wrangler kv namespace create EMAIL_KV` 返回的 hex（同上） |

`apps/worker/wrangler.jsonc` 是 gitignored 的 templated 文件 —— `deploy-worker` / `preview-worker` job 在跑 wrangler 之前会先 `envsubst < apps/worker/wrangler.example.jsonc > apps/worker/wrangler.jsonc`，把 `${D1_DATABASE_ID}` / `${KV_NAMESPACE_ID}` 替换成上面两个 secrets。

### 8.3 资源命名

| 资源 | 名字 | 改名要动哪 |
| --- | --- | --- |
| Worker | `telemail` | `apps/worker/wrangler.jsonc` 的 `name` |
| Pages 项目 | `telemail-web` | `.github/workflows/ci.yml` 里的 `--project-name`（出现 2 次）|

### 8.4 Pages Build 设置

Pages 项目 Settings → **Builds & deployments** → **Build with Git** → Disable。这样 push 到 main 时只有 GitHub Actions 执行 Pages deploy。

### 8.5 PR Preview URL 在哪看

`preview-comment` job 会在 PR 上发 / 更新一条 sticky comment，列出 Worker / Pages 的 URL 或状态：

```
| Resource           | URL / Status |
| 🔧 Worker version  | https://<id>-telemail.<account>.workers.dev |
| 📄 Pages preview   | https://<id>.telemail-web.pages.dev |
| 📄 Pages alias     | https://<sanitized-branch>.telemail-web.pages.dev |
```

跳过 / 失败的资源会显示 `_(unchanged)_` / `❌ failed`。同一个 PR 反复 push 评论会**原地更新**，不刷屏。

> Worker preview 是「version」概念 —— 拿到 preview URL 直访能测，但**不接生产 routes 的流量**。要在生产路由上用 PR 的版本，得手动在 dashboard 做 version override / gradual rollout。

### 8.6 跳过 deploy

- 改 docs / Markdown / 根配置 / `.github/`：path filter 自然过滤，不触发 deploy
- 整个 workflow 都不想跑：commit message 带 `[skip ci]`
- 改 worker / page：Worker、Pages job 并行跑，互不依赖
