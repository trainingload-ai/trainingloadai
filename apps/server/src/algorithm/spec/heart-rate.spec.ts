import { describe, expect, it } from '@jest/globals';
import { estimateLthrFrom30MinuteFieldTest } from '../heart-rate';

const minutePoint = (minute: number, heartRate: number) => ({
  tMs: minute * 60_000,
  heartRate,
});

describe('heart-rate algorithms', () => {
  describe('estimateLthrFrom30MinuteFieldTest', () => {
    it('uses the average HR from minute 10 to minute 30 for a 30-minute test', () => {
      const records = Array.from({ length: 31 }, (_, minute) =>
        minutePoint(minute, minute < 10 ? 140 : 170),
      );

      expect(
        estimateLthrFrom30MinuteFieldTest(records),
      ).toMatchObject({
        lthr: 170,
        testStartMs: 0,
        measureStartMs: 10 * 60_000,
        measureEndMs: 30 * 60_000,
      });
    });

    it('keeps the strongest rolling 30-minute candidate by its final 20 minutes', () => {
      const records = Array.from({ length: 46 }, (_, minute) => {
        const heartRate = minute < 15 ? 145 : minute < 25 ? 160 : 175;
        return minutePoint(minute, heartRate);
      });

      expect(
        estimateLthrFrom30MinuteFieldTest(records),
      ).toMatchObject({
        lthr: 175,
        testStartMs: 15 * 60_000,
        measureStartMs: 25 * 60_000,
        measureEndMs: 45 * 60_000,
      });
    });

    it('returns undefined when there is no full 30-minute window', () => {
      const records = Array.from({ length: 30 }, (_, minute) =>
        minutePoint(minute, 165),
      );

      expect(
        estimateLthrFrom30MinuteFieldTest(records),
      ).toBeUndefined();
    });
  });
});
