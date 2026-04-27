# 部署

把 Telemail 部署起来要经过这些阶段：外部服务（GCP / MS Entra）→ Cloudflare 资源（D1 / KV / Queue）→ Worker + Pages → Telegram webhook + Mini App 注册。

## 1. 前置条件

- [Cloudflare](https://cloudflare.com) 账号
- [Telegram Bot](https://core.telegram.org/bots#how-do-i-create-a-bot) token（`@BotFather` 创建）
- 接收消息的 Telegram Chat ID（每个邮箱账号可配置不同的 Chat）
- **Gmail**：启用了 Gmail API 的 [Google Cloud](https://console.cloud.google.com) 项目
- **Outlook**：[Microsoft Entra ID](https://entra.microsoft.com) 应用注册
- **IMAP**：内置 IMAP Bridge（`middleware/`，docker 部署，可选，见 §6.4）

安装依赖：

```sh
bun install
```

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

> wrangler 装在仓库根 devDeps，所以 `bun wrangler …` 在仓库任何地方都能跑。`wrangler.jsonc` 在 `worker/` 下，wrangler 默认从 cwd 找它，所以下面的 `wrangler d1` / `wrangler kv` / `wrangler queues` / `wrangler secret` 命令都建议在 `worker/` 目录跑。或者从根加 `--config worker/wrangler.jsonc`。

### 4.1 D1 数据库

```sh
bun wrangler d1 create gmail-tg-bridge
```

把返回的 `database_id` 填入 `wrangler.jsonc` 中 `d1_databases[0].database_id`。然后从仓库根跑：

```sh
bun migrate:worker:remote
```

### 4.2 KV 命名空间

```sh
bun wrangler kv namespace create EMAIL_KV
```

返回的 `id` 填入 `wrangler.jsonc` 中 `kv_namespaces[0].id`。用途：access_token 缓存、消息去重、OAuth state。

### 4.3 Queue

```sh
bun wrangler queues create gmail-tg-queue
```

`wrangler.jsonc` 中已经配好 producer / consumer 绑定。Queue 用于串行处理邮件，内置重试。

### 4.4 Secrets

所有 secret 的用途和"哪些必填 / 哪些可选"见 [ENVIRONMENT.md](./ENVIRONMENT.md)。最小集：

```sh
bun wrangler secret put TELEGRAM_BOT_TOKEN
bun wrangler secret put ADMIN_TELEGRAM_ID
bun wrangler secret put ADMIN_SECRET
bun wrangler secret put TELEGRAM_WEBHOOK_SECRET
# Gmail
bun wrangler secret put GMAIL_CLIENT_ID
bun wrangler secret put GMAIL_CLIENT_SECRET
bun wrangler secret put GMAIL_PUBSUB_TOPIC
bun wrangler secret put GMAIL_PUSH_SECRET
```

## 5. Worker 部署

```sh
bun deploy:worker
```

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

> **注意**：邮件转发到**频道**时，Bot 需被设为频道管理员才能接收 reaction 事件。

## 6. Pages 部署（Mini App 前端 + web 工具页）

方案：同域 Workers Routes。前端 SPA 和 Worker 共享一个自定义域名，通过 Workers Routes 按路径分流：

- `example.com/api/*`、`/oauth/*` → Worker
- 其它（`/`、`/mail/*`、`/preview`、`/junk-check`、`/login`、`/telegram-app/*`）→ Pages

同源，零 CORS。

### 6.1 创建 Pages 项目

> 推荐用 Direct Upload + GitHub Actions 推（见下文 §8 CI/CD），不要再走 Pages 的 Git integration —— 否则 Actions 推 + CF 自动 build 会双跑撞车。如果之前接过 Git，去 Pages 项目 Settings → Builds & deployments 里把 "Build with Git" 关掉。

首次创建 Pages 项目（用 wrangler 一行就行）：

```sh
bun build:page
bun wrangler pages project create telemail-web --production-branch=main
bun wrangler pages deploy page/dist --project-name=telemail-web --branch=main
```

或者在 Cloudflare 控制台手动创建。**项目名约定**：

| 资源 | CF 项目名 | 来源 |
| --- | --- | --- |
| Worker | `telemail` | `worker/wrangler.jsonc` 里的 `name` 字段 |
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

Worker 的 `WORKER_URL` 和 `TG_MINI_APP_SHORT_NAME` secret 分别填 `https://example.com` 和刚才的 short name：

```sh
bun wrangler secret put WORKER_URL
bun wrangler secret put TG_MINI_APP_SHORT_NAME
```

## 6.4 部署 IMAP Middleware（可选，仅当要接 IMAP 账号时）

IMAP 账号走自己服务器上的桥接服务（Cloudflare Workers 不能保持 IMAP IDLE 长连接）。Middleware 在 `middleware/` 子包，docker 部署，**镜像由 CI 推到 `ghcr.io/apocalypsor/telemail-middleware`**（main 上 push 自动构建 + push `:latest` 和 `:sha-<short>` 两个 tag），服务器只 pull 不 build。

### 准备

- 一台 Linux 服务器 + Docker & Docker Compose
- 反向代理（Caddy / nginx）+ TLS，把 `middleware.example.com` 转到 `127.0.0.1:3000`
- GitHub repo 是 public 的话 GHCR 镜像默认也是 public，server 直接 pull 就行；private repo 要先在服务器 `docker login ghcr.io -u <user>` 用 PAT 登录

### 首次部署

只把 `middleware/docker-compose.yml` + `middleware/.env.example` 拷到服务器（不需要整个 repo，docker-compose 只 pull GHCR 镜像不 build）：

```sh
mkdir telemail-middleware && cd telemail-middleware
curl -O https://raw.githubusercontent.com/Apocalypsor/telemail/main/middleware/docker-compose.yml
curl -O https://raw.githubusercontent.com/Apocalypsor/telemail/main/middleware/.env.example
mv .env.example .env
# 编辑 .env：BRIDGE_SECRET=$(openssl rand -hex 32)，TELEMAIL_URL=https://example.com
docker compose up -d
```

`docker-compose.yml` 同时有 `image:` 和 `build:` 段：服务器无源码 → 走 `image: ghcr.io/...`（`pull_policy: always`）；本地开发有源码 → `docker compose build` 强制本地编。

### 反向代理（Caddy 例）

```text
middleware.example.com {
    reverse_proxy localhost:3000
}
```

### 配置 Worker

把 middleware 的 URL + 密钥告诉 Worker：

```sh
bun wrangler secret put IMAP_BRIDGE_URL          # https://middleware.example.com
bun wrangler secret put IMAP_BRIDGE_SECRET       # 和 middleware/.env 里 BRIDGE_SECRET 一致
```

### 健康检查

```sh
curl https://middleware.example.com/api/health
# {"ok":true,"total":2,"usable":2}
```

故意不带鉴权，只暴露 `{ ok, total, usable }` 三个数字（不返回邮箱地址等）。

### 更新

每次 main 更新 `middleware/**`，CI 会自动重 build 镜像 push 到 GHCR。服务器拉新版：

```sh
docker compose pull && docker compose up -d
```

固定到某个 commit（不想跟 latest 滚动）就把 `image:` 改成 `ghcr.io/apocalypsor/telemail-middleware:sha-<short>`。

## 7. 添加邮箱账号

通过 Telegram Bot 管理：

1. 向 Bot 发送 `/start` → **账号管理** → **添加账号**
2. 选择账号类型（Gmail / Outlook / IMAP），按提示完成配置
3. Gmail / Outlook 需完成 OAuth 授权；IMAP 需填写服务器信息和密码
4. 授权成功后自动创建 webhook 订阅，新邮件实时推送到 Telegram

后续 Cron Trigger 会自动维护：每分钟分发到期提醒；每小时检查 IMAP 中间件健康并重试失败的 LLM 摘要；每天凌晨（UTC 0 点）自动续订所有账号的推送通知。

## 8. CI/CD（GitHub Actions）

`.github/workflows/ci.yml` 一个 workflow，8 个 job。`changes` job 用 `dorny/paths-filter` 输出 `worker` / `page` / `middleware` 三个 boolean，后续 deploy / preview / docker job 按这三个 flag + 事件类型决定跑不跑。

### 8.1 行为矩阵

| 触发 | 跑什么 |
| --- | --- |
| `pull_request` | CI 总跑（biome + typecheck + build page + build middleware）<br/>`worker/**` 变 → `preview-worker`（`wrangler versions upload`，输出 preview URL，不接生产流量）<br/>`page/**` 变 → `preview-page`（`wrangler pages deploy --branch=<head-ref>`）<br/>`middleware/**` 变 → `docker-middleware` 仅 build 验证（不 push）<br/>**`preview-comment`** sticky comment 把上面三个的 URL / 状态贴到 PR |
| `push` to `main` | CI + 按 filter 自动部署：worker `bun deploy:worker`、pages `wrangler pages deploy --branch=main`、docker 多 arch 镜像 push 到 GHCR `:latest` + `:sha-<short>` |
| `workflow_dispatch` on `main` | **强制**三个 deploy 全跑（绕过 path filter）—— 适合 hotfix 重发 / 镜像重 push |
| `workflow_dispatch` on 其他 branch | 仅 CI |

Path filter 故意**不含** `bun.lock`：免得 middleware 改个 dep 牵连 worker / page 重部署。子包 `package.json` 已被各自 `**` 范围 cover；根 `package.json` 同时影响 worker / page（共享 devDeps）。

### 8.2 配置 Repo Secrets

GitHub repo → **Settings → Secrets and variables → Actions** 加：

| Secret | 来源 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | CF dashboard → My Profile → API Tokens → Create。权限至少：Account → Workers Scripts:Edit + Pages:Edit + Workers KV:Edit + D1:Edit + Queues:Edit |
| `CLOUDFLARE_ACCOUNT_ID` | CF dashboard 任意 Worker 详情页右下角 |

GHCR push 用内置 `GITHUB_TOKEN`（workflow 顶部 `permissions: packages: write` 已配），不需要额外 secret。Public repo → 镜像默认 public。

### 8.3 资源命名

| 资源 | 名字 | 改名要动哪 |
| --- | --- | --- |
| Worker | `telemail` | `worker/wrangler.jsonc` 的 `name` |
| Pages 项目 | `telemail-web` | `.github/workflows/ci.yml` 里的 `--project-name`（出现 2 次）|
| GHCR 镜像 | `ghcr.io/<owner>/telemail-middleware` | workflow `metadata-action` 的 `images:`（owner 自动跟 GitHub repo） |

### 8.4 关掉 Pages 的 Git Integration（如果之前接过）

Pages 项目 Settings → **Builds & deployments** → **Build with Git** → Disable。否则 push 到 main 时 CF Pages 会自己再 build 一次，跟 Actions 撞车。

### 8.5 PR Preview URL 在哪看

`preview-comment` job 会在 PR 上发 / 更新一条 sticky comment，列出三个资源的 URL 或状态：

```
| Resource           | URL / Status |
| 🔧 Worker version  | https://<id>-telemail.<account>.workers.dev |
| 📄 Pages preview   | https://<id>.telemail-web.pages.dev |
| 📄 Pages alias     | https://<sanitized-branch>.telemail-web.pages.dev |
| 🐳 Middleware      | ✅ build OK (no push on PR) |
```

跳过 / 失败的资源会显示 `_(unchanged)_` / `❌ failed`。同一个 PR 反复 push 评论会**原地更新**，不刷屏。

> Worker preview 是「version」概念 —— 拿到 preview URL 直访能测，但**不接生产 routes 的流量**。要在生产路由上用 PR 的版本，得手动在 dashboard 做 version override / gradual rollout。

### 8.6 跳过 deploy

- 改 docs / 根配置 / `.github/`：path filter 自然过滤，不触发 deploy
- 整个 workflow 都不想跑：commit message 带 `[skip ci]`
- 改 worker 和 page 都改了：两个 deploy 并行跑，互不依赖
