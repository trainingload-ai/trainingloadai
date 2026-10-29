import { describe, expect, it } from '@jest/globals';
import { findBestTimeForDistance } from '@/algorithm/window-analysis.util';
import { normalizePeakPaceSeries } from '../metrics/tasks/peak-pace.task';

describe('normalizePeakPaceSeries', () => {
  it('does not combine a chronological point with a decoder backfill tail', () => {
    const series = normalizePeakPaceSeries([
      { time: '2026-07-25T12:42:07.000Z', distance: 0 },
      { time: '2026-07-25T12:42:59.000Z', distance: 148.51 },
      { time: '2026-07-25T13:44:00.000Z', distance: 10814.17 },
      { time: '2026-07-25T12:43:00.000Z', distance: 10814.17 },
    ]);

    const best5kSeconds = findBestTimeForDistance(series, 5000);
    expect(best5kSeconds).not.toBeNull();
    expect(5000 / best5kSeconds!).toBeLessThan(5);
  });
});
