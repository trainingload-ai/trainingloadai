import { describe, expect, it } from '@jest/globals';
import { firstRunningThresholdSpeed } from '../metrics/tasks/pace-govss.task';

describe('firstRunningThresholdSpeed', () => {
  it('rejects a walking-speed CS and falls back to a valid TP', () => {
    expect(firstRunningThresholdSpeed(1, 3.2)).toBe(3.2);
  });

  it('returns no threshold when every candidate is walking-speed', () => {
    expect(firstRunningThresholdSpeed(1, 1.5)).toBeUndefined();
  });

  it('keeps the first valid running threshold', () => {
    expect(firstRunningThresholdSpeed(3.6, 3.2)).toBe(3.6);
  });
});

import { PaceGovssTask } from '../metrics/tasks/pace-govss.task';
import type { MetricsContext } from '../metrics/context';
import type { AnalyzePersistenceService } from '@/analyze/analyze-persistence.service';

const activityStart = new Date('2026-09-06T07:43:38Z');
const point = (seconds: number) => ({
  time: new Date(+activityStart + seconds * 1000).toISOString(),
  tMs: +activityStart + seconds * 1000,
  distance: (seconds * 2200) / 1410,
  speed: 2200 / 1410,
});
const contextFor = (seconds: number[], sampleSec: number): MetricsContext =>
  ({
    inputs: {
      sportType: 'RUN',
      activity: {
        id: 2415,
        sportType: 'RUN',
        sportDefinitionCode: 'TREADMILL_RUNNING',
        startTime: activityStart,
        timerTime: 1410,
        distance: 2200,
      },
      canonicalRecords: seconds.map(point),
    },
    cache: {
      sampleSec,
      pacePreload: { context: { CS: 3.2, userWeight: 70, userHeight: 1.75 } },
    },
    outputs: {},
  }) as unknown as MetricsContext;

describe('PaceGovssTask cumulative treadmill coverage', () => {
  const task = new PaceGovssTask({} as AnalyzePersistenceService);
  it('gives the same load for continuous samples and screen-off cumulative delivery', async () => {
    const sparseInput = contextFor([3, 6, 9, 12, 1380, 1410], 3);
    const sparse = await task.exec(sparseInput);
    const dense = await task.exec(
      contextFor(
        Array.from({ length: 1410 }, (_, index) => index + 1),
        1,
      ),
    );
    expect(sparse.outputs.paceGovss.govss).toBeGreaterThan(0);
    expect(sparse.outputs.paceGovss.govss).toBeCloseTo(
      dense.outputs.paceGovss.govss,
      4,
    );
    // Reconstructed points are only used for load integration, never persisted as sensor facts.
    expect(sparseInput.inputs.canonicalRecords).toHaveLength(6);
  });
  it('does not calculate a full-session load from an incomplete cumulative series', async () => {
    const result = await task.exec(contextFor([3, 6, 9, 12], 3));
    expect(result.outputs.paceGovss).toBeUndefined();
  });
});

describe('PaceGovssTask grade-aware load', () => {
  const task = new PaceGovssTask({} as AnalyzePersistenceService);

  function outdoorContext(grade?: number): MetricsContext {
    const speed = 3.2;
    return {
      inputs: {
        sportType: 'RUN',
        activity: {
          id: 3001,
          sportType: 'RUN',
          sportDefinitionCode: 'RUNNING',
          startTime: activityStart,
          timerTime: 600,
          distance: speed * 600,
        } as MetricsContext['inputs']['activity'],
        canonicalRecords: Array.from({ length: 600 }, (_, index) => ({
          time: new Date(+activityStart + index * 1000).toISOString(),
          tMs: +activityStart + index * 1000,
          distance: speed * index,
          speed,
          grade,
        })),
      },
      cache: {
        sampleSec: 1,
        pacePreload: {
          paceZones: {} as never,
          context: { CS: 3.2, userWeight: 70, userHeight: 1.75 },
        },
      },
      outputs: {},
      errors: {},
    };
  }

  it('uses record grade only when its coverage is sufficient', async () => {
    const flat = await task.exec(outdoorContext());
    const uphill = await task.exec(outdoorContext(5));

    expect(flat.outputs.paceGovss?.gradeMode).toBe('flat');
    expect(flat.outputs.paceGovss?.gradeCoverageRatio).toBe(0);
    expect(uphill.outputs.paceGovss?.gradeMode).toBe('record');
    expect(uphill.outputs.paceGovss?.gradeCoverageRatio).toBe(1);
    expect(uphill.outputs.paceGovss?.govss).toBeGreaterThan(
      flat.outputs.paceGovss?.govss ?? 0,
    );
  });
});
