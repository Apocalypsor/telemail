export function getDeviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function getDeviceTimeZoneOrDefault(defaultTimeZone = "UTC"): string {
  return getDeviceTimeZone() ?? defaultTimeZone;
}
