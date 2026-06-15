const FORWARD_LOCAL_PART = /^fwd-([a-f0-9]{24})$/i;
const PLUS_LOCAL_PART = /^inbox\+([a-f0-9]{24})$/i;

export const extractForwardToken = (recipient: string): string | null => {
  const at = recipient.lastIndexOf("@");
  if (at <= 0) return null;
  const local = recipient.slice(0, at).toLowerCase();
  return (
    local.match(FORWARD_LOCAL_PART)?.[1] ??
    local.match(PLUS_LOCAL_PART)?.[1] ??
    null
  );
};
