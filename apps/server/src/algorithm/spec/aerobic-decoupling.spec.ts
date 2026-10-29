import { describe, expect, it } from '@jest/globals';
import { computeAerobicDecoupling } from '../AerobicDecoupling';

function point(second: number, heartRate: number) {
  return {
    time: new Date(second * 1000).toISOString(),
    tMs: second * 1000,
    distance: String(second * 3),
    heartRate,
    power: 200,
    speed: 3,
  };
}

describe('computeAerobicDecoupling', () => {
  it('按时长而不是样本数切分不规则采样的前后半程', () => {
    const rows = [
      ...Array.from({ length: 121 }, (_, index) => point(index * 5, 100)),
      ...Array.from({ length: 299 }, (_, index) => point(601 + index, 100)),
      ...Array.from({ length: 301 }, (_, index) => point(900 + index, 110)),
    ];

    expect(computeAerobicDecoupling(rows, 'power')).toBeCloseTo(9.09, 2);
  });

  it('长缺口不作为有观测的前后半程时长', () => {
    const rows = [point(0, 100), point(600, 100), point(1200, 110)];
    expect(computeAerobicDecoupling(rows, 'power')).toBeUndefined();
  });
});
