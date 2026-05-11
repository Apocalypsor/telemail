export function normalizeIanaTimeZone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timeZone = value.trim();
  if (!timeZone || timeZone.length > 80) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return null;
  }
}
