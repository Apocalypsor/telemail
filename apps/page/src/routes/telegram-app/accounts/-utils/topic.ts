export const parseOptionalTopicId = (
  value: string,
): number | null | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
};

export const topicIdInputValue = (
  topicId: number | null | undefined,
): string => {
  return topicId == null ? "" : String(topicId);
};
