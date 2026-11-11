/** Detail tabs show at most one month of future data. Calendar keys avoid DST drift. */
export function metricForecastDays(range: string | number): number {
  return Math.min(Number(range), 30);
}

export function metricForecastEnd(
  date: string,
  range: string | number,
): string {
  const end = new Date(`${date}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + metricForecastDays(range));
  return end.toISOString().slice(0, 10);
}
