# gmail-tg-bridge

A Cloudflare Worker that receives emails via [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/) and forwards them to a Telegram chat — including attachments.

## How It Works

1. Cloudflare Email Routing delivers incoming emails to the Worker.
2. The Worker parses the raw email (headers, body, attachments) using [postal-mime](https://github.com/nickytonline/postal-mime).
3. A formatted message (sender, time, subject, body) is sent to Telegram.
4. Attachments are sent as real files within the same Telegram message:
   - **1 attachment** → `sendDocument` with caption
   - **Multiple attachments** → `sendMediaGroup` with caption on the first file

Body text is automatically truncated to fit Telegram's character limits (4096 for text messages, 1024 for captions).

## Prerequisites

- A [Cloudflare](https://cloudflare.com) account with a domain
- [Email Routing](https://developers.cloudflare.com/email-routing/) enabled on the domain
- A [Telegram Bot](https://core.telegram.org/bots#how-do-i-create-a-bot) token
- The Telegram Chat ID to receive messages

## Setup

### 1. Install dependencies

```sh
npm install
```

### 2. Configure secrets

```sh
npx wrangler secret put TG_TOKEN    # Your Telegram Bot token
npx wrangler secret put CHAT_ID     # Target Telegram chat ID
```

### 3. Set up Email Routing

In the Cloudflare dashboard, go to **Email Routing → Routing Rules** and create a rule that forwards emails to this Worker.

### 4. Deploy

```sh
npm run deploy
```

## Development

```sh
npm run dev       # Start local dev server
npm test          # Run tests
npm run cf-typegen # Regenerate TypeScript types from wrangler.jsonc
```

## Project Structure

```
src/
  index.ts        # Worker entry point — email handler + Telegram API calls
test/
  index.spec.ts   # Tests
wrangler.jsonc    # Cloudflare Worker configuration
```

## Environment Variables

| Secret     | Description                          |
| ---------- | ------------------------------------ |
| `TG_TOKEN` | Telegram Bot API token               |
| `CHAT_ID`  | Telegram chat ID to send messages to |

## Telegram Message Format

```
发件人:  Name <email@example.com>
时  间:  2026/2/22 10:30:00
主  题:  Subject line

(body text, auto-truncated if too long)
```

Attachments appear as downloadable files attached to the same message.

## License

Private
