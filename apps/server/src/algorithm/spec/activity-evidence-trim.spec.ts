import { describe, expect, it } from '@jest/globals';
import { SportType } from '@prisma/client';
import { ActivityPeakMetricWriterService } from '@/api/activity/metrics/shared/peak-metric-writer.service';
import { MaxMeanPowerTask } from '@/api/activity/metrics/tasks/max-mean-power.task';
import type {
  CanonicalActivityRecord,
  MetricsContext,
} from '@/api/activity/metrics/context';
import { calculateCp } from '../fitness-cp';
import { sanitizeActivityRecordSpeeds } from '../instantaneous-speed';
import {
  computeMaxMeanObservedWindows,
  STANDARD_PEAK_DURATIONS,
} from '../time-series-metrics';
import {
  CONTAMINATED_RUN_TAIL_TRIM,
  cropContaminatedActivityTail,
  detectContaminatedRunTail,
  type ActivityTrimSample,
} from '../activity-evidence-trim';

const START = Date.parse('2026-04-01T07:00:00.000Z');

function point(
  second: number,
  overrides: Partial<ActivityTrimSample> = {},
): ActivityTrimSample & { tMs: number } {
  return {
    tMs: START + second * 1000,
    time: new Date(START + second * 1000).toISOString(),
    speed: 4.4 + (second % 5) * 0.05,
    cadence: 170 + (second % 4),
    power: 300 + (second % 7) * 8,
    ...overrides,
  };
}

function jogging(seconds: number, from = 0) {
  return Array.from({ length: seconds }, (_, offset) => point(from + offset));
}

function vehicleTail(
  from: number,
  seconds: number,
  overrides: Partial<ActivityTrimSample> = {},
) {
  return Array.from({ length: seconds }, (_, offset) =>
    point(from + offset, {
      speed: 15.5 + (offset % 3) * 0.4,
      power: 1050 + (offset % 5) * 30,
      cadence: undefined,
      ...overrides,
    }),
  );
}

function peaksOf(samples: readonly ActivityTrimSample[]) {
  const windows = computeMaxMeanObservedWindows(
    samples.map((sample) => ({
      tMs: sample.tMs ?? 0,
      value:
        typeof sample.power === 'number' && Number.isFinite(sample.power)
          ? sample.power
          : null,
    })),
    STANDARD_PEAK_DURATIONS,
  );
  return Object.fromEntries(
    Object.entries(windows).map(([key, window]) => [
      key,
      window ? Math.round(window.value * 100) / 100 : undefined,
    ]),
  );
}

function powerModel(samples: readonly ActivityTrimSample[]) {
  const points = Object.entries(STANDARD_PEAK_DURATIONS).flatMap(
    ([key, seconds]) => {
      const value = peaksOf(samples)[key];
      return typeof value === 'number' ? [{ seconds, value }] : [];
    },
  );
  return calculateCp(points);
}

function asRecords(
  samples: readonly ActivityTrimSample[],
): CanonicalActivityRecord[] {
  return samples.map((sample) => ({
    time: new Date(sample.tMs ?? 0).toISOString(),
    tMs: sample.tMs ?? 0,
    speed: sample.speed ?? undefined,
    enhancedSpeed: sample.enhancedSpeed ?? undefined,
    cadence: sample.cadence ?? undefined,
    power: sample.power ?? undefined,
  }));
}

function taskContext(
  samples: readonly ActivityTrimSample[],
  sport: SportType = SportType.RUN,
): MetricsContext {
  return {
    inputs: {
      activity: {
        id: 1,
        sportType: sport,
        startTime: new Date(START),
      },
      sportType: sport,
      measuredPowerEvidence: 'RELIABLE',
      canonicalRecords: asRecords(samples),
    },
    cache: {},
    outputs: {},
    errors: {},
  } as MetricsContext;
}

describe('contaminated run tail evidence trim', () => {
  const clean = jogging(900);
  const contaminated = [...clean, ...vehicleTail(900, 35)];

  it('extends the exclusion through the acceleration into a confirmed vehicle tail', () => {
    const jog = Array.from({ length: 1500 }, (_, second) =>
      point(second, { speed: 3.1, power: 220, cadence: 170 }),
    );
    const burst = Array.from({ length: 8 }, (_, offset) =>
      point(1500 + offset, { speed: 8.4, power: 522, cadence: 61 }),
    );
    const settled = Array.from({ length: 30 }, (_, offset) =>
      point(1508 + offset, { speed: 3.1, power: 210, cadence: 80 }),
    );
    const ramp = [4.8, 6.4, 8, 10, 11.5, 12].map((speed, offset) =>
      point(1538 + offset, {
        speed,
        power: 221 + offset * 120,
        cadence: undefined,
      }),
    );
    const vehicle = Array.from({ length: 24 }, (_, offset) =>
      point(1544 + offset, {
        speed: 12.2 + offset * 0.15,
        power: 948 + offset * 13,
        cadence: undefined,
      }),
    );
    const samples = [...jog, ...burst, ...settled, ...ramp, ...vehicle];
    const trim = detectContaminatedRunTail(samples, 'RUN');

    expect(trim?.startIndex).toBe(1538);
    expect(
      peaksOf(cropContaminatedActivityTail(samples, 'RUN').records)['1s'],
    ).toBe(522);
    expect(peaksOf(samples)['1s']).toBeGreaterThan(1000);
  });

  it('excludes a normal run followed by a short car-speed tail', () => {
    const trim = detectContaminatedRunTail(contaminated, 'RUN');

    expect(trim).toMatchObject({
      startIndex: 900,
      excludedSampleCount: 35,
      corroboration: 'cadence-and-power',
      reason: 'exclude-contaminated-tail',
    });
    expect(trim?.vehicleDurationSeconds).toBe(34);
    expect(
      cropContaminatedActivityTail(contaminated, 'RUN').records,
    ).toHaveLength(900);
  });

  it('leaves a clean run unchanged', () => {
    expect(detectContaminatedRunTail(clean, 'RUN')).toBeNull();
    expect(cropContaminatedActivityTail(clean, 'RUN')).toEqual({
      records: clean,
      trim: null,
    });
    expect(peaksOf(cropContaminatedActivityTail(clean, 'RUN').records)).toEqual(
      peaksOf(clean),
    );
  });

  it('does not treat an isolated startup spike as a contaminated tail', () => {
    const spiked = [
      point(0, { speed: 20, power: 2000, cadence: undefined }),
      ...jogging(899, 1),
    ];

    expect(detectContaminatedRunTail(spiked, 'RUN')).toBeNull();
    expect(peaksOf(spiked)['1s']).toBe(2000);
  });

  it('does not trim cycling, a fast running finish, or vehicle speed with normal running power and cadence', () => {
    expect(detectContaminatedRunTail(contaminated, 'CYCLING')).toBeNull();
    expect(
      detectContaminatedRunTail(
        [
          ...jogging(900),
          ...vehicleTail(900, 20, { speed: 6.5, power: 600, cadence: 190 }),
        ],
        'RUN',
      ),
    ).toBeNull();
    expect(
      detectContaminatedRunTail(
        [
          ...jogging(900),
          ...vehicleTail(900, 35, { power: 324, cadence: 176 }),
        ],
        'RUN',
      ),
    ).toBeNull();
  });

  it('keeps the activity when the tail is too short, below the speed ceiling, or would remove the whole session', () => {
    expect(
      detectContaminatedRunTail(
        [...jogging(900), ...vehicleTail(900, 10)],
        'RUN',
      ),
    ).toBeNull();
    expect(
      detectContaminatedRunTail(
        [
          ...jogging(900),
          ...vehicleTail(900, 30, {
            speed: CONTAMINATED_RUN_TAIL_TRIM.speedMetersPerSecond,
          }),
        ],
        'RUN',
      ),
    ).toBeNull();
    expect(
      detectContaminatedRunTail(
        [...jogging(40), ...vehicleTail(40, 35)],
        'RUN',
      ),
    ).toBeNull();
  });

  it('accepts either empty cadence or power above the session distribution', () => {
    expect(
      detectContaminatedRunTail(
        [...jogging(900), ...vehicleTail(900, 35, { cadence: 176 })],
        'RUN',
      )?.corroboration,
    ).toBe('power');
    expect(
      detectContaminatedRunTail(
        [...jogging(900), ...vehicleTail(900, 35, { power: 330, cadence: 0 })],
        'RUN',
      )?.corroboration,
    ).toBe('cadence');
  });

  it('bridges a missing speed sample but stops at a return to running speed', () => {
    const withGap = [
      ...jogging(900),
      ...vehicleTail(900, 18),
      point(918, { speed: undefined, power: undefined, cadence: undefined }),
      ...vehicleTail(919, 18),
    ];
    expect(detectContaminatedRunTail(withGap, 'RUN')?.startIndex).toBe(900);

    const resumed = [
      ...jogging(900),
      ...vehicleTail(900, 20),
      point(920, { speed: 5, power: 360, cadence: 170 }),
      ...vehicleTail(921, 20),
    ];
    expect(detectContaminatedRunTail(resumed, 'RUN')?.startIndex).toBe(921);
  });

  it('still treats a few stopped samples after the vehicle segment as the tail', () => {
    const stopped = [
      ...contaminated,
      ...Array.from({ length: 3 }, (_, offset) =>
        point(935 + offset, { speed: 0, power: 0, cadence: 0 }),
      ),
    ];

    expect(detectContaminatedRunTail(stopped, 'RUN')).toMatchObject({
      startIndex: 900,
      excludedSampleCount: 38,
    });
    expect(
      detectContaminatedRunTail(
        [
          ...contaminated,
          ...Array.from({ length: 10 }, (_, offset) =>
            point(935 + offset, { speed: 0, power: 0, cadence: 0 }),
          ),
        ],
        'RUN',
      ),
    ).toBeNull();
  });

  it('crops every channel of the tail before speed sanitization', () => {
    const tagged = contaminated.map((sample, index) => ({
      ...sample,
      heartRate: index >= 900 ? 114 : 150,
      distance: index >= 900 ? 13_400 + index : 1_000 + index,
      positionLat: index >= 900 ? 55.2 : 55.0,
      positionLong: index >= 900 ? 37.8 : 37.6,
    }));
    const prepared = cropContaminatedActivityTail(tagged, 'RUN').records;

    expect(prepared).toHaveLength(900);
    expect(prepared.at(-1)).toBe(tagged[899]);
    expect(prepared.some((sample) => sample.heartRate === 114)).toBe(false);
    expect(prepared.some((sample) => sample.positionLat === 55.2)).toBe(false);
    expect(prepared.some((sample) => sample.positionLong === 37.8)).toBe(false);
    expect(Math.max(...prepared.map((sample) => sample.distance))).toBeLessThan(
      2_000,
    );
    expect(
      prepared.every(
        (sample) =>
          (sample.speed ?? 0) <=
          CONTAMINATED_RUN_TAIL_TRIM.speedMetersPerSecond,
      ),
    ).toBe(true);

    const sanitized = sanitizeActivityRecordSpeeds(prepared, 'RUN');
    expect(sanitized).toHaveLength(900);
    expect(sanitized[100].speed).toBeCloseTo(contaminated[100].speed ?? 0, 6);
    expect(sanitized[100].power).toBe(contaminated[100].power);
    expect(sanitized[100].heartRate).toBe(150);
  });

  it('builds mean-maximal power and the power model without the car-speed tail', () => {
    const dirtyPeaks = peaksOf(contaminated);
    const trimmed = cropContaminatedActivityTail(contaminated, 'RUN').records;
    const trimmedPeaks = peaksOf(trimmed);
    const cleanPeaks = peaksOf(clean);
    const dirtyModel = powerModel(contaminated);
    const trimmedModel = powerModel(trimmed);
    const cleanModel = powerModel(clean);

    expect(dirtyPeaks['1s']).toBeGreaterThan(1000);
    expect(dirtyPeaks['30s']).toBeGreaterThan(1000);
    expect(trimmedPeaks).toEqual(cleanPeaks);
    expect(trimmedPeaks['1s']).toBeLessThan(400);
    expect(trimmedPeaks['30s']).toBeLessThan(400);
    expect(dirtyModel.valid).toBe(true);
    expect(trimmedModel.valid).toBe(true);
    expect(cleanModel.valid).toBe(true);
    expect(dirtyModel.pMax).toBeGreaterThan(800);
    expect(trimmedModel.pMax).toBe(cleanModel.pMax);
    expect(trimmedModel.wPrime).toBe(cleanModel.wPrime);
    expect(trimmedModel.pMax).toBeLessThan(dirtyModel.pMax ?? 0);
    expect(trimmedModel.wPrime).toBeLessThan(dirtyModel.wPrime ?? 0);
  });

  it('truncates the mean-maximal power task evidence window and leaves a clean run untouched', async () => {
    const task = new MaxMeanPowerTask(
      new ActivityPeakMetricWriterService({} as never),
    );
    const trimmed = await task.exec(taskContext(contaminated));
    const untouched = await task.exec(taskContext(clean));
    const spiked = [
      point(0, { speed: 20, power: 2000, cadence: undefined }),
      ...jogging(899, 1),
    ];
    const startup = await task.exec(taskContext(spiked));

    expect(trimmed.outputs.maxMeanPower?.['30s']).toBeLessThan(400);
    expect(trimmed.outputs.maxMeanPower?.['30s']).toBe(
      untouched.outputs.maxMeanPower?.['30s'],
    );
    expect(
      trimmed.outputs.maxMeanPowerWindows?.['5s']?.endElapsedSec,
    ).toBeLessThan(900);
    expect(
      trimmed.outputs.maxMeanPowerWindows?.['5s']?.parameters?.activityTrim,
    ).toMatchObject({
      method: 'exclude-contaminated-tail',
      excludedFromElapsedSec: 900,
      excludedSampleCount: 35,
    });
    expect(
      untouched.outputs.maxMeanPowerWindows?.['5s']?.parameters,
    ).not.toHaveProperty('activityTrim');
    expect(detectContaminatedRunTail(spiked, 'RUN')).toBeNull();
    expect(startup.outputs.maxMeanPower?.['1s']).toBeLessThan(400);
  });
});
