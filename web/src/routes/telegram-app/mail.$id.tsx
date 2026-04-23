import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useEffect } from "react";
import { z } from "zod";
import { MailBodyFrame } from "@/components/mail-body-frame";
import { MailFab } from "@/components/mail-fab";
import { api } from "@/lib/api";
import { ROUTE_MINI_APP_API_MAIL } from "@/lib/routes";
import { mailPreviewResponseSchema } from "@/lib/schemas";
import { getTelegram } from "@/lib/tg";

// accountId + t 必填：缺失 → validateSearch 抛出，由父级 errorComponent 渲染。
// folder / back 可选。
const searchSchema = z.object({
  accountId: z.coerce.number(),
  t: z.string(),
  folder: z.string().optional(),
  back: z.string().optional(),
});

export const Route = createFileRoute("/telegram-app/mail/$id")({
  component: MailPreviewPage,
  validateSearch: zodValidator(searchSchema),
});

function MailPreviewPage() {
  const { id: emailMessageId } = Route.useParams();
  const search = Route.useSearch();
  const qc = useQueryClient();

  const queryKey = [
    "mail-preview",
    emailMessageId,
    search.accountId,
    search.folder,
  ];

  const q = useQuery({
    queryKey,
    queryFn: async () => {
      const url = ROUTE_MINI_APP_API_MAIL.replace(
        ":id",
        encodeURIComponent(emailMessageId),
      ).replace(/^\//, "");
      const searchParams: Record<string, string> = {
        accountId: String(search.accountId),
        t: search.t,
      };
      if (search.folder) searchParams.folder = search.folder;
      const data = await api.get(url, { searchParams }).json();
      return mailPreviewResponseSchema.parse(data);
    },
  });

  // BackButton 绑定：URL 带 ?back= 时显示，点击跳回该 URL（mail-list / reminders）
  useEffect(() => {
    const tg = getTelegram();
    const bb = tg?.BackButton;
    if (!bb) return;
    if (!search.back) {
      bb.hide();
      return;
    }
    const handler = () => {
      window.location.href = search.back as string;
    };
    bb.show();
    bb.onClick(handler);
    return () => {
      bb.offClick(handler);
      bb.hide();
    };
  }, [search.back]);

  if (q.isLoading) {
    return <div style={{ padding: 20, color: "var(--hint)" }}>加载中…</div>;
  }
  if (q.isError || !q.data) {
    return (
      <div style={{ padding: 20, color: "var(--danger)" }}>邮件加载失败</div>
    );
  }

  const d = q.data;
  return (
    <>
      <style>{PAGE_CSS}</style>
      <MailMetaHeader
        subject={d.meta.subject ?? null}
        from={d.meta.from ?? null}
        to={d.meta.to ?? null}
        date={d.meta.date ?? null}
        accountEmail={d.accountEmail}
        webMailUrl={d.webMailUrl}
        tgMessageLink={d.tgMessageLink}
      />
      <div className="mail-body">
        <MailBodyFrame bodyHtml={d.bodyHtml} />
      </div>
      <MailFab
        emailMessageId={emailMessageId}
        accountId={search.accountId}
        token={search.t}
        starred={d.starred}
        inJunk={d.inJunk}
        inArchive={d.inArchive}
        canArchive={d.canArchive}
        onChanged={() => qc.invalidateQueries({ queryKey })}
      />
    </>
  );
}

function MailMetaHeader({
  subject,
  from,
  to,
  date,
  accountEmail,
  webMailUrl,
  tgMessageLink,
}: {
  subject: string | null;
  from: string | null;
  to: string | null;
  date: string | null;
  accountEmail: string | null;
  webMailUrl: string;
  tgMessageLink: string | null;
}) {
  if (!subject && !from && !to && !accountEmail && !date) return null;
  const shareText = subject ? `📧 ${subject}` : "";

  function openExternal(
    e: React.MouseEvent,
    url: string,
    kind: "tg" | "browser",
  ) {
    e.preventDefault();
    const tg = getTelegram();
    if (kind === "tg" && tg?.openTelegramLink) {
      tg.openTelegramLink(url);
      // 某些 TG 客户端不会自动关 Mini App —— 兜底显式 close
      setTimeout(() => tg.close?.(), 50);
    } else if (tg?.openLink) {
      tg.openLink(url);
    } else {
      window.open(url, "_blank", "noopener");
    }
  }

  function share(e: React.MouseEvent) {
    e.preventDefault();
    const url = webMailUrl;
    if (!url) return;
    const shareLink =
      `https://t.me/share/url?url=${encodeURIComponent(url)}` +
      `&text=${encodeURIComponent(shareText)}`;
    const tg = getTelegram();
    if (tg?.openTelegramLink) tg.openTelegramLink(shareLink);
    else window.open(shareLink, "_blank", "noopener");
  }

  return (
    <div className="mail-meta">
      {subject && webMailUrl && (
        <a
          className="subject"
          href={webMailUrl}
          onClick={(e) => openExternal(e, webMailUrl, "browser")}
          title="在浏览器打开"
        >
          {subject}
          <span className="ext">↗</span>
        </a>
      )}
      {subject && !webMailUrl && <div className="subject">{subject}</div>}
      <div className="actions">
        {tgMessageLink && (
          <a
            href={tgMessageLink}
            onClick={(e) => openExternal(e, tgMessageLink, "tg")}
          >
            💬 跳到 TG 原消息
          </a>
        )}
        {webMailUrl && (
          <button type="button" onClick={share}>
            📤 分享
          </button>
        )}
      </div>
      {from && (
        <div>
          <span className="label">From:</span> {from}
        </div>
      )}
      {to && (
        <div>
          <span className="label">To:</span> {to}
        </div>
      )}
      {accountEmail && (
        <div>
          <span className="label">Account:</span> {accountEmail}
        </div>
      )}
      {date && (
        <div>
          <span className="label">Date:</span> {date}
        </div>
      )}
    </div>
  );
}

const PAGE_CSS = `
.mail-meta {
  background: var(--surface);
  border-bottom: 1px solid var(--separator);
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.7;
}
.mail-meta .subject {
  font-size: 22px; font-weight: 600; margin-bottom: 6px; word-break: break-word;
  color: var(--link);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  display: block; text-decoration: none;
}
.mail-meta .subject:active { opacity: .6; }
.mail-meta .subject .ext { font-size: 14px; opacity: .7; margin-left: 4px; }
.mail-meta .actions { margin-top: 6px; display: flex; gap: 12px; flex-wrap: wrap; }
.mail-meta .actions a, .mail-meta .actions button {
  font-size: 12px; color: var(--link);
  text-decoration: none; -webkit-tap-highlight-color: transparent;
  background: transparent; border: 0; padding: 0; cursor: pointer;
  font-family: inherit;
}
.mail-meta .actions a:active, .mail-meta .actions button:active { opacity: .6; }
.mail-meta .label { color: var(--hint); }
.mail-body { padding: 16px; padding-bottom: 100px; word-break: break-word; }
`;
