/** 邮件状态 badge：放在 subject 和 meta 之间，避免把状态混进邮件原始标题。 */
export const MailStatusBadges = ({ starred }: MailStatusBadgesProps) => {
  if (!starred) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-200">
        <span aria-hidden="true">⭐</span>
        <span>已星标</span>
      </span>
    </div>
  );
};

interface MailStatusBadgesProps {
  starred: boolean;
}
