/**
 * 展示用 IANA 时区：优先用户档案，其次浏览器，最后 UTC。
 */
export function resolveUserDisplayTimezone(profileTimezone?: string | null): string {
  const tz = typeof profileTimezone === "string" ? profileTimezone.trim() : "";
  if (tz) return tz;
  if (typeof Intl !== "undefined") {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      /* ignore */
    }
  }
  return "UTC";
}

type ProfileTz = { timezone?: string | null };

/**
 * 活动相关 UI：优先活动自带 IANA，其次档案与浏览器。
 */
export function resolveActivityDisplayTimezone(
  activity: { timezone?: string | null },
  profile?: ProfileTz | null,
): string {
  const at =
    typeof activity.timezone === "string" ? activity.timezone.trim() : "";
  if (at) return at;
  return resolveUserDisplayTimezone(profile?.timezone);
}
