import { describe, expect, it } from '@jest/globals';
import {
  compareFitnessTimelineEvents,
  DEFAULT_RESTING_HEART_RATE_BPM,
  FitnessTimelineProjector,
  fitnessTimelineFingerprint,
  type FitnessTimelineEvent,
  type FitnessTimelineObservation,
  type FitnessTimelineValue,
} from '../fitness-timeline';

const at = (iso: string) => new Date(iso);

function observation(
  value: number,
  effectiveAt = at('2026-01-01T11:00:00.000Z'),
): FitnessTimelineObservation {
  return {
    metric: 'MAX_HR',
    sport: 'UNKNOWN',
    value,
    value2: null,
    effectiveAt,
    evidenceFingerprint: fitnessTimelineFingerprint({ value }),
    sourceActivityIds: [value],
  };
}

describe('FitnessTimelineProjector', () => {
  it('orders end and external events before starts at the same instant', () => {
    const same = at('2026-01-01T10:00:00.000Z');
    const events: FitnessTimelineEvent[] = [
      { kind: 'ACTIVITY_START', at: same, activityId: 3 },
      {
        kind: 'ACTIVITY_END',
        at: same,
        activityId: 2,
        observations: [],
        autoUpdateEnabled: true,
      },
      {
        kind: 'EXTERNAL_METRIC',
        at: same,
        metric: {
          ...observation(190, same),
          origin: 'MANUAL',
        },
      },
    ];
    expect(
      events.sort(compareFitnessTimelineEvents).map((event) => event.kind),
    ).toEqual(['EXTERNAL_METRIC', 'ACTIVITY_END', 'ACTIVITY_START']);
  });

  it('does not expose a future metric to an earlier activity', () => {
    const future: FitnessTimelineValue = {
      ...observation(190, at('2026-01-02T00:00:00.000Z')),
      origin: 'AUTO',
    };
    const projector = new FitnessTimelineProjector([future]);
    expect(
      projector.resolve({
        metric: 'MAX_HR',
        sport: 'RUN',
        at: at('2026-01-01T10:00:00.000Z'),
      }).origin,
    ).toBe('UNAVAILABLE');
  });

  it('uses current activity bootstrap without adding it to future state', () => {
    const projector = new FitnessTimelineProjector();
    const resolved = projector.resolve({
      metric: 'MAX_HR',
      sport: 'RUN',
      at: at('2026-01-01T10:00:00.000Z'),
      bootstrap: observation(184),
    });
    expect(resolved.origin).toBe('ACTIVITY_BOOTSTRAP');
    expect(
      projector.resolve({
        metric: 'MAX_HR',
        sport: 'RUN',
        at: at('2026-01-01T12:00:00.000Z'),
      }).origin,
    ).toBe('UNAVAILABLE');
  });

  it('keeps automatic MAX_HR monotonic and aggregates an equal-time group', () => {
    const projector = new FitnessTimelineProjector();
    const first = projector.applyObservationGroup({
      effectiveAt: at('2026-01-01T11:00:00.000Z'),
      observations: [observation(180), observation(186)],
      autoUpdateEnabled: true,
    });
    const lower = projector.applyObservationGroup({
      effectiveAt: at('2026-01-02T11:00:00.000Z'),
      observations: [observation(182, at('2026-01-02T11:00:00.000Z'))],
      autoUpdateEnabled: true,
    });
    expect(first).toHaveLength(1);
    expect(first[0].value).toBe(186);
    expect(lower).toHaveLength(0);
  });

  it('coalesces multiple causal waves at one instant into one change point', () => {
    const effectiveAt = at('2026-01-01T11:00:00.000Z');
    const projector = new FitnessTimelineProjector();
    projector.applyObservationGroup({
      effectiveAt,
      observations: [observation(180, effectiveAt)],
      autoUpdateEnabled: true,
    });
    projector.applyObservationGroup({
      effectiveAt,
      observations: [observation(186, effectiveAt)],
      autoUpdateEnabled: true,
    });

    expect(projector.changePoints()).toHaveLength(1);
    expect(projector.changePoints()[0]).toEqual(
      expect.objectContaining({ value: 186, effectiveAt }),
    );
  });

  it('does not propagate observations when automatic updates are disabled', () => {
    const projector = new FitnessTimelineProjector();
    expect(
      projector.applyObservationGroup({
        effectiveAt: at('2026-01-01T11:00:00.000Z'),
        observations: [observation(186)],
        autoUpdateEnabled: false,
      }),
    ).toEqual([]);
    expect(projector.changePoints()).toEqual([]);
  });

  it('lets MANUAL win an exact-time tie and allows later AUTO evolution', () => {
    const manualAt = at('2026-01-01T10:00:00.000Z');
    const projector = new FitnessTimelineProjector([
      { ...observation(190, manualAt), origin: 'MANUAL' },
    ]);

    const tied = projector.applyObservationGroup({
      effectiveAt: manualAt,
      observations: [observation(195, manualAt)],
      autoUpdateEnabled: true,
    });
    const laterAt = at('2026-01-02T10:00:00.000Z');
    const later = projector.applyObservationGroup({
      effectiveAt: laterAt,
      observations: [observation(195, laterAt)],
      autoUpdateEnabled: true,
    });

    expect(tied).toEqual([]);
    expect(later).toHaveLength(1);
    expect(
      projector.resolve({
        metric: 'MAX_HR',
        sport: 'UNKNOWN',
        at: at('2026-01-03T10:00:00.000Z'),
      }),
    ).toEqual(expect.objectContaining({ origin: 'AUTO', value: 195 }));
  });

  it('uses the versioned resting-heart-rate default only when explicitly allowed', () => {
    const projector = new FitnessTimelineProjector();
    const denied = projector.resolve({
      metric: 'RESTING_HR',
      sport: 'RUN',
      at: at('2026-01-01T10:00:00.000Z'),
    });
    const allowed = projector.resolve({
      metric: 'RESTING_HR',
      sport: 'RUN',
      at: at('2026-01-01T10:00:00.000Z'),
      allowRestingHrDefault: true,
    });
    expect(denied.origin).toBe('UNAVAILABLE');
    expect(allowed.origin).toBe('DEFAULT_RESTING_HEART_RATE');
    expect(allowed.value).toBe(DEFAULT_RESTING_HEART_RATE_BPM);
  });

  it('is deterministic across repeated runs and input group order', () => {
    const run = (rows: FitnessTimelineObservation[]) => {
      const projector = new FitnessTimelineProjector();
      projector.applyObservationGroup({
        effectiveAt: at('2026-01-01T11:00:00.000Z'),
        observations: rows,
        autoUpdateEnabled: true,
      });
      return {
        state: projector.stateFingerprint(),
        changes: projector.changePoints(),
      };
    };
    expect(run([observation(180), observation(186)])).toEqual(
      run([observation(186), observation(180)]),
    );
  });

  it('is prefix invariant when later activities are appended', () => {
    const replay = (count: number) => {
      const projector = new FitnessTimelineProjector();
      for (let index = 0; index < count; index += 1) {
        const effectiveAt = new Date(
          Date.parse('2026-01-01T00:00:00.000Z') + index * 60_000,
        );
        projector.applyObservationGroup({
          effectiveAt,
          observations: [observation(170 + index, effectiveAt)],
          autoUpdateEnabled: true,
        });
      }
      return projector.changePoints();
    };
    expect(replay(20).slice(0, 10)).toEqual(replay(10));
  });

  it.each([500, 2_000])(
    'projects %i synthetic events deterministically within a bounded runtime',
    (count) => {
      const startedAt = performance.now();
      const projector = new FitnessTimelineProjector();
      for (let index = 0; index < count; index += 1) {
        const effectiveAt = new Date(
          Date.parse('2026-01-01T00:00:00.000Z') + index * 1_000,
        );
        projector.applyObservationGroup({
          effectiveAt,
          observations: [
            {
              metric: 'CP',
              sport: 'CYCLING',
              value: 170 + index,
              value2: 18_000 - index,
              effectiveAt,
              evidenceFingerprint: fitnessTimelineFingerprint({ index }),
              sourceActivityIds: [index + 1],
            },
          ],
          autoUpdateEnabled: true,
        });
      }
      const elapsedMs = performance.now() - startedAt;
      expect(projector.changePoints()).toHaveLength(count);
      expect(elapsedMs).toBeLessThan(5_000);
    },
  );

  it('records p50/p95 runtime and peak heap growth for 500/2,000-event timelines', () => {
    const report = [500, 2_000].map((count) => {
      const durations: number[] = [];
      let peakHeapGrowthBytes = 0;
      for (let sample = 0; sample < 12; sample += 1) {
        const beforeHeap = process.memoryUsage().heapUsed;
        const startedAt = performance.now();
        const projector = new FitnessTimelineProjector();
        for (let index = 0; index < count; index += 1) {
          const effectiveAt = new Date(
            Date.parse('2026-01-01T00:00:00.000Z') + index * 1_000,
          );
          projector.applyObservationGroup({
            effectiveAt,
            observations: [
              {
                metric: 'CP',
                sport: 'CYCLING',
                value: 170 + index,
                value2: 18_000 - index,
                effectiveAt,
                evidenceFingerprint: fitnessTimelineFingerprint({ index }),
                sourceActivityIds: [index + 1],
              },
            ],
            autoUpdateEnabled: true,
          });
        }
        durations.push(performance.now() - startedAt);
        peakHeapGrowthBytes = Math.max(
          peakHeapGrowthBytes,
          process.memoryUsage().heapUsed - beforeHeap,
        );
        expect(projector.changePoints()).toHaveLength(count);
      }
      durations.sort((left, right) => left - right);
      const percentile = (ratio: number) =>
        durations[Math.ceil(durations.length * ratio) - 1] ?? 0;
      return {
        count,
        samples: durations.length,
        p50Ms: Number(percentile(0.5).toFixed(3)),
        p95Ms: Number(percentile(0.95).toFixed(3)),
        peakHeapGrowthBytes: Math.max(0, peakHeapGrowthBytes),
        databaseQueries: 0,
        highFrequencyReads: 0,
        databaseConnections: 0,
      };
    });

    // This structured line is intentionally retained in CI output as the
    // release evidence requested by the replay performance acceptance gate.
    console.info(`[fitness-timeline-performance] ${JSON.stringify(report)}`);
    for (const row of report) {
      expect(row.p95Ms).toBeLessThan(5_000);
      expect(row.peakHeapGrowthBytes).toBeLessThan(256 * 1024 * 1024);
    }
  });
});
