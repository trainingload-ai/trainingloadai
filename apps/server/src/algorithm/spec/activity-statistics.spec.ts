import { $Enums } from '@prisma/client';
import { describe, expect, it } from '@jest/globals';
import { computeActivityStatistics } from '../activity-statistics';

describe('computeActivityStatistics', () => {
  it('按真实时间加权并把长缺口留作未知覆盖', () => {
    const result = computeActivityStatistics(
      [
        {
          tMs: 0,
          distance: 0,
          speed: 2,
          power: 0,
          cadence: 80,
          grade: 2,
          altitude: 100,
          gap: 0.45,
        },
        {
          tMs: 5_000,
          distance: 10,
          speed: 4,
          power: 200,
          cadence: 90,
          grade: 0,
          altitude: 105,
          gap: 0.2,
        },
        {
          tMs: 10_000,
          distance: 30,
          speed: 10,
          power: 400,
          cadence: 100,
          grade: -3,
          altitude: 104,
          gap: 0.1,
        },
        {
          tMs: 30_000,
          distance: 230,
          speed: 10,
          power: 400,
          cadence: 100,
          grade: -3,
          altitude: 100,
          gap: 0.1,
        },
      ],
      $Enums.SportType.CYCLING,
    );

    const speed = result.distributions.find((item) => item.metric === 'SPEED');
    const power = result.distributions.find((item) => item.metric === 'POWER');
    const ascent = result.distributions.find(
      (item) => item.metric === 'ASCENT_SPEED',
    );
    expect(speed?.average).toBe(3);
    expect(speed?.coveredSeconds).toBe(10);
    expect(speed?.coverageRatio).toBeCloseTo(1 / 3);
    expect(power?.min).toBe(0);
    expect(power?.average).toBe(100);
    expect(ascent?.average).toBe(3600);
    expect(result.terrain).toMatchObject({
      uphillSeconds: 5,
      flatSeconds: 5,
      downhillSeconds: 0,
      uphillDistanceM: 10,
      flatDistanceM: 20,
      profile: 'UPHILL',
      gradeCoveredSeconds: 10,
    });
  });

  it('无可靠时间跨度时不伪造统计', () => {
    expect(
      computeActivityStatistics([{ tMs: 0, speed: 3 }], $Enums.SportType.RUN),
    ).toEqual({ distributions: [], terrain: null });
  });

  it('跑步 cadence 统一为总步频而不是单侧值', () => {
    const result = computeActivityStatistics(
      [
        { tMs: 0, cadence: 82, grade: 0 },
        { tMs: 10_000, cadence: 84, grade: 0 },
      ],
      $Enums.SportType.RUN,
    );
    const cadence = result.distributions.find(
      (item) => item.metric === 'CADENCE',
    );

    expect(cadence?.unit).toBe('spm');
    expect(cadence?.average).toBe(164);
    expect(cadence?.activeAverage).toBe(164);
    expect(result.terrain?.flatAvgCadence).toBe(164);
  });
});
