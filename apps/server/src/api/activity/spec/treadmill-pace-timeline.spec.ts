import { describe, it, expect } from '@jest/globals';
import { treadmillPaceTimeline } from '../metrics/treadmill-pace-timeline';
import { computeGOVSS } from '@/algorithm/GOVSS';

const startTime = new Date('2026-09-06T07:43:38Z');
const at = (seconds: number, distance: number) => ({
  time: new Date(+startTime + seconds * 1000).toISOString(),
  tMs: +startTime + seconds * 1000,
  distance,
  speed: 1.6,
});
const activity = { startTime, timerTime: 1410, distance: 2200 };

describe('treadmillPaceTimeline', () => {
  it('counts a screen-off cumulative update by its covered duration', () => {
    const timeline = treadmillPaceTimeline(
      [at(30, 46.8), at(1380, 2153.2), at(1410, 2200)],
      activity,
    )!;
    expect(timeline.records).toHaveLength(1410);
    expect(timeline.records.at(-1)!.distance).toBeCloseTo(2200, 3);
    const dense = treadmillPaceTimeline(
      Array.from({ length: 1410 }, (_, i) =>
        at(i + 1, (2200 * (i + 1)) / 1410),
      ),
      activity,
    )!;
    const load = (rows: typeof timeline.records) =>
      computeGOVSS(
        rows.map((r) => ({ ...r, timestamp: new Date(r.time) })) as never,
        70,
        1.75,
        3.2,
        1,
        { gradeMode: 'flat' },
      ).govss;
    expect(load(timeline.records)).toBeGreaterThan(0);
    expect(load(timeline.records) / load(dense.records)).toBeCloseTo(1, 2);
  });
  it('does not use partial or reset distance as full-session evidence', () => {
    expect(treadmillPaceTimeline([at(30, 46.8)], activity)).toBeNull();
    expect(
      treadmillPaceTimeline(
        [at(30, 100), at(60, 90), at(1410, 2200)],
        activity,
      ),
    ).toBeNull();
  });
  it('bounds active duration by timer time when wall time includes a pause', () => {
    const timeline = treadmillPaceTimeline([at(1470, 2200)], activity)!;
    expect(timeline.records).toHaveLength(1410);
    expect(timeline.records.at(-1)!.distance).toBeCloseTo(2200, 3);
  });
});
