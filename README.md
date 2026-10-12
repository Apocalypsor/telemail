# Telemail

运行在 Cloudflare Workers + Pages 上的邮件转发系统，监控 **Gmail / Outlook / IMAP** 收件箱，把新邮件转发到 Telegram 聊天——支持**多账号**、附件、AI 摘要、Mini App 稍后提醒。

- **Gmail**：Google Cloud Pub/Sub 推送通知实时接收，Cron 每 10 分钟拉取未读邮件兜底
- **Outlook**：Microsoft Graph webhook 订阅实时接收，Cron 每 10 分钟拉取未读邮件兜底
- **IMAP**（可选）：Cloudflare Email Routing 接收自动转发信号，Worker 也会每 10 分钟通过 IMAP 拉取未读邮件兜底
- **MCP**：用户可在 bot 里生成 API key，让 agent 通过 `/api/mcp` 搜索和读取自己的邮件

## 技术栈

- **Runtime**：Cloudflare Workers（后端）+ Cloudflare Pages（Mini App 前端 + web 工具页）
- **后端**：[Elysia](https://elysiajs.com)（CloudflareAdapter）+ [grammY](https://grammy.dev) + Cloudflare D1 / KV / Durable Objects / Cron
- **前端**：[Vite](https://vite.dev) + React 19 + [TanStack Router](https://tanstack.com/router) + [TanStack Query](https://tanstack.com/query) + [HeroUI](https://heroui.com) + [Eden treaty](https://elysiajs.com/eden/treaty/overview)（端到端类型安全 RPC）+ [TypeBox](https://github.com/sinclairzx81/typebox)
- **邮件解析**：[postal-mime](https://github.com/postalsys/postal-mime)；HTML → Markdown：[turndown](https://github.com/mixmark-io/turndown) → Telegram Rich HTML
- **AI 摘要**：通过兼容 OpenAI Responses API 的 LLM endpoint 生成摘要、标签和垃圾邮件判断
- **i18n**：[i18next](https://www.i18next.com)（当前仅中文）

## 文档

- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** —— 从 0 部署到 Cloudflare（GCP / MS Entra / D1 / KV / Workers + Pages / Bot webhook）
- **[docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md)** —— 所有 secrets、Bindings、Cron、D1 schema 的参考

## 本地检查

需要 Bun **1.4.3 或更新版本**。类型检查使用 [Bun 原生 `bun check`](https://bun.com/docs/runtime/check)。

```sh
bun install
bun lint        # Biome 格式与 lint 检查
bun typecheck   # 各 workspace 类型检查，含前端路由生成和 Worker 测试类型
bun worker test
bun page build
```

原来的 Biome `bun check` 命令已改为 `bun lint`；直接运行 `bun check` 现在执行原生类型检查。完整检查请用 `bun typecheck`，确保先生成路由。

根目录通过 `bun worker <脚本>` / `bun page <脚本>` 调用对应 workspace 的脚本，例如 `bun worker dev`、`bun page dev`、`bun worker migrate:local`、`bun page deploy`。前端 `build` 只执行 Vite 构建（插件自动生成路由），类型检查独立运行。

## 多账号

- Gmail / Outlook / IMAP 三种混用
- 每个账号可以配**不同的 Telegram Chat ID / Topic ID**（不同邮箱转不同聊天 / 频道 / forum topic）
- Forum supergroup 可在 General 里 `/start` 自动创建 `Inbox` topic，用 General 做操作区、Inbox 放邮件
- 所有 Gmail 账号共享同一个 GCP 项目；所有 Outlook 账号共享同一个 Entra ID 应用；所有账号共享同一个 Telegram Bot
- 账号信息存 D1，通过 Mini App 管理（`/start` → 账号管理）
- 支持**临时禁用**：推送 / cron / 列表跳过该账号；配置保留随时可恢复

## Bot 命令

Bot 只保留主入口和帮助，其它常用功能通过 `/start` 面板进入。

| 命令     | 说明         |
| -------- | ------------ |
| `/start` | 打开管理面板 |
| `/help`  | 查看帮助信息 |

## 许可证

[AGPL-3.0-or-later](./LICENSE) © 2026 Apocalypsor
