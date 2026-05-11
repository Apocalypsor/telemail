export const getDeviceTimeZone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

export const getDeviceTimeZoneOrDefault = (defaultTimeZone = "UTC"): string => {
  return getDeviceTimeZone() ?? defaultTimeZone;
};
