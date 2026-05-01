export function resolveSameOriginRedirectUrl(
  requestUrl: string,
  target = "/",
): string {
  const base = new URL(requestUrl);
  try {
    const redirectUrl = new URL(target, base.origin);
    if (redirectUrl.origin !== base.origin) return `${base.origin}/`;
    return redirectUrl.toString();
  } catch {
    return `${base.origin}/`;
  }
}
