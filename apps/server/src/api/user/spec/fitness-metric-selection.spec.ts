import { describe, expect, it } from '@jest/globals';

import { selectEffectiveFitnessMetric } from '../fitness-metric-selection';

type MetricFixture = {
  recordedAt: Date;
  source: string;
  sport: string;
  type: string;
  value: number;
};

const metric = (overrides: Partial<MetricFixture> = {}) => ({
  recordedAt: new Date('2026-01-01T00:00:00.000Z'),
  source: 'AUTO',
  sport: 'RUN',
  type: 'CS',
  value: 3,
  ...overrides,
});

describe('selectEffectiveFitnessMetric', () => {
  it('selects the newest value regardless of manual or auto source', () => {
    const selected = selectEffectiveFitnessMetric(
      [
        metric({
          recordedAt: new Date('2026-01-02T00:00:00.000Z'),
          source: 'MANUAL',
          value: 1.866,
        }),
        metric({
          recordedAt: new Date('2026-01-01T00:00:00.000Z'),
          source: 'AUTO',
          value: 3,
        }),
      ],
      'CS',
      'RUN',
    );

    expect(selected?.source).toBe('MANUAL');
    expect(selected?.value).toBe(1.866);
  });

  it('allows a newer automatic estimate to supersede an older manual value', () => {
    const selected = selectEffectiveFitnessMetric(
      [
        metric({ source: 'MANUAL' }),
        metric({
          recordedAt: new Date('2026-01-03T00:00:00.000Z'),
          source: 'AUTO',
        }),
      ],
      'CS',
      'RUN',
    );

    expect(selected?.source).toBe('AUTO');
  });

  it('prefers manual input only when timestamps are identical', () => {
    const selected = selectEffectiveFitnessMetric(
      [metric({ source: 'AUTO' }), metric({ source: 'MANUAL' })],
      'CS',
      'RUN',
    );

    expect(selected?.source).toBe('MANUAL');
  });

  it('keeps sport-specific metrics ahead of legacy UNKNOWN values', () => {
    const selected = selectEffectiveFitnessMetric(
      [
        metric({ source: 'MANUAL', sport: 'RUN' }),
        metric({
          recordedAt: new Date('2026-02-01T00:00:00.000Z'),
          source: 'AUTO',
          sport: 'UNKNOWN',
        }),
      ],
      'CS',
      'RUN',
    );

    expect(selected?.sport).toBe('RUN');
  });

  it('ignores an invalid walking-speed AUTO CS for RUN', () => {
    const selected = selectEffectiveFitnessMetric(
      [
        metric({
          recordedAt: new Date('2026-08-12T00:00:00.000Z'),
          source: 'AUTO',
          value: 1,
        }),
        metric({
          recordedAt: new Date('2026-08-01T00:00:00.000Z'),
          source: 'MANUAL',
          value: 3.2,
        }),
      ],
      'CS',
      'RUN',
    );

    expect(selected?.source).toBe('MANUAL');
    expect(selected?.value).toBe(3.2);
  });

  it('keeps a deliberately entered slow manual RUN CS', () => {
    const selected = selectEffectiveFitnessMetric(
      [metric({ source: 'MANUAL', value: 1.5 })],
      'CS',
      'RUN',
    );

    expect(selected?.value).toBe(1.5);
  });
});
