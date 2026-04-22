import { theme } from "@assets/theme";
import { MailBodyFrame } from "@components/shared/mail-body-frame";
import { MailFab, type MailFabProps } from "@components/shared/mail-fab";
import type { MailMeta } from "@/types";

interface MailPageProps extends MailFabProps {
  meta: MailMeta;
  accountEmail?: string | null;
  /** 已经过 CID 内联 + 图片代理改写的邮件正文 HTML */
  bodyHtml: string;
}

export function MailPage({
  meta,
  accountEmail,
  bodyHtml,
  ...fabProps
}: MailPageProps) {
  return (
    <>
      <MailMetaHeader meta={meta} accountEmail={accountEmail} />
      <MailBodyFrame bodyHtml={bodyHtml} />
      <MailFab {...fabProps} />
    </>
  );
}

function MailMetaHeader({
  meta,
  accountEmail,
}: {
  meta: MailMeta;
  accountEmail?: string | null;
}) {
  if (!meta.subject && !meta.from && !meta.to && !accountEmail && !meta.date)
    return null;

  return (
    <div
      style={`background:${theme.surface};border-bottom:1px solid ${theme.border};padding:12px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:${theme.text};line-height:1.7`}
    >
      {meta.subject && (
        <div
          style={`font-size:24px;font-weight:600;color:${theme.text};margin-bottom:6px`}
        >
          {meta.subject}
        </div>
      )}
      {meta.from && (
        <div>
          <span style={`color:${theme.muted}`}>From:</span> {meta.from}
        </div>
      )}
      {meta.to && (
        <div>
          <span style={`color:${theme.muted}`}>To:</span> {meta.to}
        </div>
      )}
      {accountEmail && (
        <div>
          <span style={`color:${theme.muted}`}>Account:</span> {accountEmail}
        </div>
      )}
      {meta.date && (
        <div>
          <span style={`color:${theme.muted}`}>Date:</span> {meta.date}
        </div>
      )}
    </div>
  );
}
