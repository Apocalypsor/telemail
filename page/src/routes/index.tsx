import { Button, Card } from "@heroui/react";
import { createFileRoute } from "@tanstack/react-router";
import { WebLayout } from "@/components/web-layout";

/**
 * 域名根 `/`：Telemail 是一个 Telegram Mini App，入口在 TG bot 内部。
 * 直接访问根路径给一个简洁的落地页，告知用户入口在 TG，外加三张 feature 卡
 * 简述产品能做什么。
 */
function LandingPage() {
  return (
    <WebLayout>
      <section className="max-w-4xl mx-auto mt-6 sm:mt-14 space-y-10 px-2">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-3xl mb-5">
            ✉️
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-100">
            Telemail
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 mt-3 max-w-md mx-auto leading-relaxed">
            把 Telegram 变成你的邮箱 —— 新邮件实时推送到聊天，
            <br className="hidden sm:inline" />
            支持 Gmail / Outlook / IMAP，AI 分类 + 稍后提醒。
          </p>
          <Button
            onPress={() => window.open("https://t.me", "_blank", "noopener")}
            className="mt-7 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-semibold"
            size="lg"
          >
            在 Telegram 里打开 →
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Feature
            icon="📬"
            title="实时推送"
            text="Gmail / Outlook / IMAP，新邮件直接发到聊天。"
          />
          <Feature
            icon="🤖"
            title="AI 分类"
            text="LLM 识别垃圾 / 通知 / 交易，自动打标给摘要。"
          />
          <Feature
            icon="⏰"
            title="稍后提醒"
            text="不想马上处理？一键设定 Mini App 提醒。"
          />
        </div>
      </section>
    </WebLayout>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <Card className="bg-zinc-900 border border-zinc-800 p-5">
      <div className="text-2xl mb-3">{icon}</div>
      <div className="text-zinc-100 font-semibold mb-1.5">{title}</div>
      <div className="text-xs text-zinc-500 leading-relaxed">{text}</div>
    </Card>
  );
}

export const Route = createFileRoute("/")({
  component: LandingPage,
});
