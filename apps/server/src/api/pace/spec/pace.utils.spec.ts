import { describe, expect, it } from '@jest/globals';
import { PaceZoneModel, SportType, ZoneBase } from '@prisma/client';
import { generatePaceZonesFromProfile } from '../pace.utils';

describe('generatePaceZonesFromProfile', () => {
  it('generates Friel threshold pace zones as GAP seconds per meter', () => {
    const result = generatePaceZonesFromProfile(
      {
        tp: 4,
        paceZoneModel: PaceZoneModel.FRIEL,
      },
      SportType.RUN,
    );

    expect(result?.benchmark).toBe(ZoneBase.TP);
    expect(result?.zones).toHaveLength(5);
    expect(result?.zones[0]).toMatchObject({
      order: 1,
      name: 'Z1 Super Oxygen Run',
    });
    expect(result?.zones[0].min).toBeCloseTo(1 / (4 * 0.64), 6);
    expect(result?.zones[0].max).toBeCloseTo(1 / (4 * 0.61), 6);
    expect(result?.zones[4]).toMatchObject({
      order: 5,
      name: 'Z5 Competition/Sprint',
    });
    expect(result?.zones[4].min).toBeCloseTo(1 / (4 * 1.2), 6);
    expect(result?.zones[4].max).toBeCloseTo(1 / (4 * 0.81), 6);
  });

  it('generates Daniels zones by default from VO2max speed', () => {
    const result = generatePaceZonesFromProfile({
      vo2max: 50,
    });

    expect(result?.benchmark).toBe(ZoneBase.VO2MAX);
    expect(result?.zones.map((zone) => zone.name)).toEqual([
      'Z1 Easy (E)',
      'Z2 Marathon (M)',
      'Z3 Threshold (T)',
      'Z4 Interval (I)',
      'Z5 Repetition (R)',
    ]);
    expect(result?.zones[0].min).toBeLessThan(result?.zones[0].max as number);
    expect(result?.zones[4].min).toBeLessThan(result?.zones[4].max as number);
  });

  it('keeps Daniels zones based on VDOT when conflicting TP/CS are present', () => {
    const profile = { vo2max: 16.9, paceZoneModel: PaceZoneModel.DANIELS };
    const expected = generatePaceZonesFromProfile(profile);
    const result = generatePaceZonesFromProfile({
      ...profile,
      tp: 1000 / 355,
      cs: 3.2,
    });

    expect(result?.benchmark).toBe(ZoneBase.VO2MAX);
    expect(result).toEqual(expected);
    expect(result?.zones[2].min * 1000).toBeCloseTo(582.839, 2);
    expect(result?.zones[2].max * 1000).toBeCloseTo(609.332, 2);
    expect(
      generatePaceZonesFromProfile({ ...profile, vo2max: 33.3 }),
    ).not.toEqual(result);
  });

  it.each([undefined, 0, -1, NaN, Infinity])(
    'does not substitute TP/CS for unusable Daniels VDOT %s',
    (vo2max) => {
      expect(
        generatePaceZonesFromProfile({
          paceZoneModel: PaceZoneModel.DANIELS,
          vo2max,
          tp: 1000 / 355,
          cs: 3.2,
        }),
      ).toBeNull();
    },
  );

  it('returns null when the selected model lacks a usable base speed', () => {
    expect(
      generatePaceZonesFromProfile({
        paceZoneModel: PaceZoneModel.FRIEL,
        tp: 0,
      }),
    ).toBeNull();
    expect(
      generatePaceZonesFromProfile({
        paceZoneModel: PaceZoneModel.DANIELS,
        vo2max: -1,
      }),
    ).toBeNull();
  });
});
