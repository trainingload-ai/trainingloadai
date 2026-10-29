import { describe, expect, it } from '@jest/globals';
import { fillTimedValuesToZones, fillValueToPaceZones } from '../zones';
import { resolveHeartRateSettings } from '../zones';
import { ZoneBase } from '@prisma/client';

describe('fillValueToPaceZones', () => {
  it('keeps configured pace zones when there are no speed samples', () => {
    const zones = fillValueToPaceZones(
      [],
      [
        { name: 'z1', order: 1, min: 0.3, max: 0.4 },
        { name: 'z2', order: 2, min: 0.4, max: 0.5 },
      ],
      1,
    );

    expect(zones).toEqual([
      {
        name: 'z1',
        order: 1,
        min: 0.3,
        max: 0.4,
        duration: 0,
        avg: 0,
        percent: 0,
      },
      {
        name: 'z2',
        order: 2,
        min: 0.4,
        max: 0.5,
        duration: 0,
        avg: 0,
        percent: 0,
      },
    ]);
  });
});

describe('fillTimedValuesToZones', () => {
  it('uses observed seconds, preserves zero, and does not bridge long gaps', () => {
    const zones = fillTimedValuesToZones(
      [
        { tMs: 0, value: 0 },
        { tMs: 5_000, value: 150 },
        { tMs: 10_000, value: 300 },
        { tMs: 30_000, value: 300 },
      ],
      [
        { name: 'z1', min: 0, max: 100 },
        { name: 'z2', min: 100, max: 200 },
        { name: 'z3', min: 200 },
      ],
    );

    expect(zones).toEqual([
      expect.objectContaining({ name: 'z1', duration: 5, avg: 0, percent: 50 }),
      expect.objectContaining({
        name: 'z2',
        duration: 5,
        avg: 150,
        percent: 50,
      }),
      expect.objectContaining({ name: 'z3', duration: 0, percent: 0 }),
    ]);
  });
});

describe('resolveHeartRateSettings', () => {
  it('uses MAXHR × 88% instead of treating MAXHR as LTHR', () => {
    const zones = resolveHeartRateSettings(
      {
        benchmark: ZoneBase.LTHR,
        zones: [{ name: 'z1', min: 80, max: 90 }],
      },
      { maxHeartRate: 190 },
    );

    expect(zones).toEqual([{ name: 'z1', min: 134, max: 150 }]);
  });

  it('returns undefined when neither LTHR nor MAXHR is available', () => {
    expect(
      resolveHeartRateSettings(
        {
          benchmark: ZoneBase.LTHR,
          zones: [{ name: 'z1', min: 80, max: 90 }],
        },
        {},
      ),
    ).toBeUndefined();
  });
});
