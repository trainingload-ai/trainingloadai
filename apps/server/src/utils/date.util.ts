import dayjs = require('dayjs');
import { Logger } from '@nestjs/common';

const logger = new Logger('DateUtil');

export function getUniqueDates(dates: Date[]): Date[] {
  const sortedDates = dates.sort((a, b) => a.getTime() - b.getTime());
  const uniqueDatesMap = new Map<string, Date>();
  for (const date of sortedDates) {
    const dateStr = dayjs(date).format('YYYY-MM-DD');
    uniqueDatesMap.set(dateStr, date);
  }
  return Array.from(uniqueDatesMap.values()).sort(
    (a, b) => a.getTime() - b.getTime(),
  );
}

export async function processDatesWithRetry(
  dates: Date[],
  worker: (date: Date) => Promise<void>,
  options?: {
    concurrency?: number;
    maxRetries?: number;
    onProgress?: (info: {
      completed: number;
      total: number;
      date: Date;
      success: boolean;
      attempt: number;
      error?: unknown;
    }) => void;
  },
) {
  const total = dates.length;
  if (total === 0) return;

  const concurrency = Math.max(1, options?.concurrency ?? 3);
  const maxRetries = Math.max(0, options?.maxRetries ?? 2);

  let nextIndex = 0;
  let completed = 0;

  const runNext = async () => {
    while (true) {
      const idx = nextIndex++;
      if (idx >= total) return;

      const date = dates[idx];
      let attempt = 0;
      while (true) {
        try {
          attempt += 1;
          await worker(date);
          completed += 1;
          options?.onProgress?.({
            completed,
            total,
            date,
            success: true,
            attempt,
          });
          break;
        } catch (e) {
          if (attempt >= maxRetries + 1) {
            completed += 1;
            options?.onProgress?.({
              completed,
              total,
              date,
              success: false,
              attempt,
              error: e,
            });
            logger.error(
              `[processDatesWithRetry] 重试后仍失败：date=${date.toISOString()}，错误=${
                e instanceof Error ? e.message : String(e)
              }`,
            );
            break;
          }
          await new Promise((r) => setTimeout(r, 200 * attempt));
        }
      }
    }
  };

  const runners = Array.from({ length: Math.min(concurrency, total) }, () =>
    runNext(),
  );
  await Promise.all(runners);
}
