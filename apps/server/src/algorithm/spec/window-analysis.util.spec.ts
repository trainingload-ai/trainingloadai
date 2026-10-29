import { describe, expect, it } from '@jest/globals';
import {
  buildIntegralSeries,
  computeMaxMeanSampledValues,
  computeMaxMeanValues,
  findBestAverageForTime,
  findBestAverageWindowForTime,
  findBestDistanceForTime,
  findBestDistanceWindowForTime,
  findBestTimeForDistance,
  findBestTimeWindowForDistance,
  findBestValueDeltaForTime,
  findBestValueDeltaWindowForTime,
  findStableSegments,
} from '../window-analysis.util';

describe('window-analysis util', () => {
  describe('distance and value delta windows', () => {
    it('finds the shortest time for a target distance window', () => {
      const series = [
        { tMs: 0, dM: 0 },
        { tMs: 300_000, dM: 1000 },
        { tMs: 570_000, dM: 2000 },
      ];

      expect(findBestTimeForDistance(series, 1000)).toBe(270);
      expect(findBestTimeForDistance(series.slice(0, 1), 1000)).toBeNull();
    });

    it('does not create a pace peak across a long recording gap', () => {
      const series = [
        { tMs: 0, dM: 0 },
        { tMs: 5_000, dM: 20 },
        { tMs: 30_000, dM: 500 },
        { tMs: 35_000, dM: 520 },
      ];

      expect(findBestTimeWindowForDistance(series, 400)).toBeNull();
      expect(findBestDistanceWindowForTime(series, 30)).toBeNull();
    });

    it('finds the best value delta and returns window metadata', () => {
      const series = [
        { tMs: 0, v: 0 },
        { tMs: 30_000, v: 100 },
        { tMs: 60_000, v: 210 },
        { tMs: 90_000, v: 300 },
      ];

      expect(findBestValueDeltaForTime(series, 60)).toBe(210);
      expect(
        findBestDistanceForTime(
          series.map(({ tMs, v }) => ({ tMs, dM: v })),
          60,
        ),
      ).toBe(210);
      expect(findBestValueDeltaWindowForTime(series, 60)).toMatchObject({
        value: 210,
        startIndex: 0,
        endIndex: 2,
        startTime: 0,
        endTime: 60_000,
      });
    });
  });

  describe('mean value windows', () => {
    it('uses trapezoidal integration for non-uniform average windows', () => {
      const series = [
        { tMs: 0, value: 100 },
        { tMs: 30_000, value: 200 },
        { tMs: 60_000, value: 300 },
        { tMs: 90_000, value: 100 },
      ];

      expect(findBestAverageForTime(series, 60)).toBe(225);
      expect(findBestAverageWindowForTime(series, 60)).toMatchObject({
        value: 225,
        startTime: 30_000,
        endTime: 90_000,
      });
    });

    it('builds an integral series while ignoring duplicate or reversed time deltas', () => {
      expect(
        buildIntegralSeries([
          { tMs: 0, value: 100 },
          { tMs: 10_000, value: 200 },
          { tMs: 10_000, value: 400 },
          { tMs: 20_000, value: 300 },
        ]),
      ).toEqual([
        { tMs: 0, v: 0 },
        { tMs: 10_000, v: 1500 },
        { tMs: 10_000, v: 1500 },
        { tMs: 20_000, v: 5000 },
      ]);
    });

    it('computes max mean values for multiple requested durations', () => {
      const series = [
        { tMs: 0, value: 100 },
        { tMs: 30_000, value: 200 },
        { tMs: 60_000, value: 300 },
        { tMs: 90_000, value: 100 },
      ];

      expect(computeMaxMeanValues(series, { oneMinute: 60, twoMinutes: 120 }))
        .toEqual({
          oneMinute: 225,
          twoMinutes: undefined,
        });
    });

    it('computes sampled max means with full and partial sample windows', () => {
      const series = [
        { tMs: 0, value: 100 },
        { tMs: 5_000, value: 200 },
        { tMs: 10_000, value: 300 },
        { tMs: 15_000, value: 400 },
      ];

      expect(
        computeMaxMeanSampledValues(
          series,
          {
            tenSeconds: 10,
            twelveSeconds: 12,
            tooLong: 25,
          },
          5,
        ),
      ).toEqual({
        tenSeconds: 350,
        twelveSeconds: 275,
        tooLong: undefined,
      });
    });
  });

  describe('stable segment detection', () => {
    it('returns non-overlapping stable windows and skips noisy windows', () => {
      const stableA = Array.from({ length: 30 }, () => ({
        power: 200,
        heartRate: 140,
      }));
      const stableB = Array.from({ length: 30 }, () => ({
        power: 230,
        heartRate: 145,
      }));
      const noisy = Array.from({ length: 30 }, (_, index) => ({
        power: index % 2 === 0 ? 150 : 320,
        heartRate: index % 2 === 0 ? 120 : 170,
      }));

      expect(
        findStableSegments([...stableA, ...stableB, ...noisy], 30),
      ).toEqual([
        expect.objectContaining({
          startIndex: 0,
          count: 30,
          avgPower: 200,
          avgHeartRate: 140,
          stdDevPower: 0,
          stdDevHeartRate: 0,
        }),
        expect.objectContaining({
          startIndex: 30,
          count: 30,
          avgPower: 230,
          avgHeartRate: 145,
          stdDevPower: 0,
          stdDevHeartRate: 0,
        }),
      ]);
    });

    it('requires enough valid heart rate points for a stable segment', () => {
      const mostlyInvalid = Array.from({ length: 30 }, (_, index) => ({
        power: 200,
        heartRate: index < 10 ? 0 : 140,
      }));

      expect(findStableSegments(mostlyInvalid, 30)).toEqual([]);
    });
  });
});
