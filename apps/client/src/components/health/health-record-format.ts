/** Preserve the recorded local offset instead of silently substituting the viewer's timezone. */
export function formatObservationTime(
  iso: string | null,
  offset: number | null,
  timezone: string | null,
  locale: string,
) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  if (offset != null) {
    const local = new Date(date.getTime() + offset * 1000),
      minutes = Math.abs(offset) / 60,
      seconds = Math.abs(offset) % 60,
      sign = offset < 0 ? "-" : "+";
    return `${local.toISOString().slice(0, 10)} ${local.toISOString().slice(11, 19)} UTC${sign}${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(Math.floor(minutes % 60)).padStart(2, "0")}${seconds ? ":" + String(seconds).padStart(2, "0") : ""}`;
  }
  try {
    return (
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: timezone ?? "UTC",
      }).format(date) + (timezone ? "" : " UTC")
    );
  } catch {
    return date.toISOString();
  }
}
