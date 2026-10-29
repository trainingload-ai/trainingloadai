import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { FitnessCalculationService } from '../fitness-calculation.service';
import type { EvidenceRequest } from '../fitness-input';
import { fitnessMethodsTool } from '@/api/ai/core/tools/fitnessAssessment.tools';
import type { AiToolContext } from '@/api/ai/core/tool.types';

const start = new Date('2026-09-26T09:00:00Z');
const context = {
  userId: 'athlete',
  sessionId: 'ordinary-run',
  now: new Date('2026-09-27T04:00:00Z'),
};
const request: EvidenceRequest = {
  methodId: 'lthr-activity-observation',
  metric: 'LTHR',
  sport: 'RUN',
  scope: { kind: 'ACTIVITY', activityHashId: 'run' },
};

// The real preparation/calculation service runs against in-memory artifact
// storage. No user metric writer is provided: a calculation must not need one.
function fixture(
  options: {
    duration?: number;
    heartRate?: (second: number) => number | null;
    omit?: (second: number) => boolean;
    checksum?: string | null;
    maxHr?: number | null;
  } = {},
) {
  const duration = options.duration ?? 3300;
  const rows = Array.from({ length: duration + 1 }, (_, second) => ({
    epochSeconds: start.getTime() / 1000 + second,
    heartRate: options.heartRate
      ? options.heartRate(second)
      : second < 3060
        ? 162
        : 177,
    power: null,
  })).filter((_, second) => !options.omit?.(second));
  const activity = {
    id: 1,
    hashId: 'run',
    startTime: start,
    endTime: new Date(start.getTime() + duration * 1000),
    elapsedTime: duration,
    timerTime: duration,
    sampleSec: 1,
    processingStatus: 'READY',
    sportType: 'RUN',
    activityName: 'Ordinary run',
    parquetFiles: [
      {
        type: 'record',
        checksum:
          options.checksum === undefined ? 'source-v1' : options.checksum,
      },
    ],
    laps: [],
  };
  const selection = {
    rows: [activity],
    healthRows: [],
    truncated: false,
    hash: 'source-v1',
  };
  const reader = {
    timezone: jest.fn(async () => 'Asia/Shanghai'),
    resolveWindow: () => ({ from: new Date(0), to: context.now }),
    selection: jest.fn(async () => selection),
    baseline: jest.fn(async () => ({
      values: {
        LTHR: 176,
        ...(options.maxHr === null ? {} : { MAX_HR: options.maxHr ?? 200 }),
      },
      recordedAt: { LTHR: '2026-09-01T00:00:00.000Z' },
      hash: 'baseline-v1',
    })),
    samples: jest.fn(async () => rows),
  };
  const task = { id: 'task', revision: 1, facts: {}, request: {} };
  let lease = {};
  let calculation: Record<string, unknown> = {};
  const prisma = {
    $queryRaw: jest.fn(async () => []),
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
    fitnessEvidenceRevision: {
      upsert: async () => lease,
      update: async ({ data }: { data: object }) => Object.assign(lease, data),
      findUnique: async () => lease,
      updateMany: async () => {
        lease = {};
        return { count: 1 };
      },
    },
    fitnessAssessmentTask: {
      create: async ({ data }: { data: object }) => Object.assign(task, data),
      findUnique: async () => task,
      findFirst: async () => task,
      update: async ({ data }: { data: object }) => Object.assign(task, data),
    },
    fitnessCalculation: {
      create: async ({ data }: { data: object }) => {
        calculation = { state: 'PREPARED', ...structuredClone(data) };
      },
      findFirst: async () => ({ ...calculation, task, presentedAt: start }),
      updateMany: async ({ data }: { data: object }) => {
        Object.assign(calculation, data);
        return { count: 1 };
      },
    },
  };
  return {
    service: new FitnessCalculationService(prisma as never, reader as never),
    reader,
    activity,
  };
}

afterEach(() => jest.restoreAllMocks());

describe('ordinary-activity LTHR assessment', () => {
  it('discovers an ordinary estimator without attaching a maximal test workout', async () => {
    const catalog = await fitnessMethodsTool.execute({} as AiToolContext, {
      metric: 'LTHR',
      sport: 'RUN',
    });
    expect(catalog.methods[0].id).toBe(request.methodId);
    expect(catalog.testWorkout).toBeUndefined();
    const test = await fitnessMethodsTool.execute({} as AiToolContext, {
      methodId: 'lthr-30-minute',
    });
    expect(test.testWorkout?.protocol).toBe('lthr-30-minute@1');
  });

  it('computes from a 55-minute ordinary run with a short finishing surge, then compares the saved reference', async () => {
    const { service, reader } = fixture();
    const prepared = await service.prepare(context, request);
    expect(prepared.preparationStatus).toBe('READY');
    expect(prepared.reasonCode).toBeUndefined();
    expect(prepared.nextActions).toEqual([]);
    expect(prepared.evidence.segment).toEqual({
      activityHashId: 'run',
      startSeconds: 1500,
      endSeconds: 3300,
    });
    const result = await service.calculate(context, prepared.calculationId);
    expect(result.status).toBe('ESTIMATED');
    expect(result.candidates).toEqual([
      {
        metric: 'LTHR',
        value: 165,
        unit: 'bpm',
        currentValue: 176,
        currentRecordedAt: '2026-09-01T00:00:00.000Z',
        delta: -11,
      },
    ]);
    expect(result.observations[0].value).toBeCloseTo(165.00625);
    expect(result.limitations).toContain('ORDINARY_ACTIVITY_LTHR');
    expect(result.limitations).not.toContain('USER_REPORTED_PROTOCOL');
    expect(result.noMetricWrite).toBe(true);
    expect(reader.samples).toHaveBeenCalledTimes(1);
  });

  it('respects an explicitly selected window within the activity', async () => {
    const { service } = fixture();
    const prepared = await service.prepare(context, {
      ...request,
      segment: { activityHashId: 'run', startSeconds: 0 },
    });
    const result = await service.calculate(context, prepared.calculationId);
    expect(result.evidence.segment?.startSeconds).toBe(0);
    expect(result.candidates[0].value).toBe(162);
  });

  it('rescans the requested source on recomputation instead of pinning the previously auto-selected window', async () => {
    const { service, reader } = fixture();
    const prepared = await service.prepare(context, request);
    expect(prepared.evidence.segment?.startSeconds).toBe(1500);
    reader.samples.mockResolvedValue(
      Array.from({ length: 3301 }, (_, second) => ({
        epochSeconds: start.getTime() / 1000 + second,
        heartRate: second <= 1800 ? 175 : 140,
        power: null,
      })),
    );
    const refreshed = await service.recompute(context, prepared.calculationId);
    expect(refreshed.preparationStatus).toBe('READY');
    expect(refreshed.evidence.segment?.startSeconds).toBe(0);
    const result = await service.calculate(context, refreshed.calculationId);
    expect(result.candidates[0].value).toBe(175);
  });

  it.each<[string, Parameters<typeof fixture>[0], string]>([
    ['too short', { duration: 1200 }, 'QUALITY_REJECTED'],
    ['no heart rate', { heartRate: () => null }, 'MISSING_SIGNAL'],
    [
      'gap across every possible window',
      { omit: (s: number) => s >= 1600 && s <= 1700 },
      'QUALITY_REJECTED',
    ],
  ])('reports the actual input gap: %s', async (_name, options, reason) => {
    const { service } = fixture(options);
    const prepared = await service.prepare(context, request);
    expect(prepared.preparationStatus).toBe('UNAVAILABLE');
    expect(prepared.reasonCode).toBe(reason);
    expect(prepared.nextActions).not.toContain('ANSWER_PROTOCOL');
    expect(prepared.nextActions).not.toContain('OFFER_WORKOUT');
  });

  it('keeps the computable number when a reference needed for adoption is missing', async () => {
    const { service } = fixture({ maxHr: null });
    const prepared = await service.prepare(context, request);
    const result = await service.calculate(context, prepared.calculationId);
    expect(result.candidates[0].value).toBe(165);
    expect(result.reasonCode).toBe('REFERENCE_REQUIRED');
    expect(result.applyOptions).toEqual([]);
  });

  it('keeps the estimate when the source version cannot be verified for adoption', async () => {
    const { service } = fixture({ checksum: null });
    const prepared = await service.prepare(context, request);
    const result = await service.calculate(context, prepared.calculationId);
    expect(result.candidates[0].value).toBe(165);
    expect(result.limitations).toContain('SOURCE_VERSION_UNVERIFIED');
    expect(result.applyOptions).toEqual([]);
  });

  it('leaves protocol confirmation specific to the registered test method', async () => {
    const { service } = fixture();
    const prepared = await service.prepare(context, {
      ...request,
      methodId: 'lthr-30-minute',
      segment: { activityHashId: 'run', startSeconds: 1500 },
    });
    expect(prepared.reasonCode).toBe('PROTOCOL_UNKNOWN');
    expect(prepared.nextActions).toEqual(['ANSWER_PROTOCOL']);
  });

  it('offers user adoption without requiring protocol confirmation or increasing the old value', async () => {
    const previous = { ...process.env };
    try {
      process.env.FITNESS_ASSESSMENT_ENABLED = 'true';
      process.env.FITNESS_ESTIMATE_APPLY_ENABLED = 'true';
      process.env.FITNESS_LTHR_APPLY_ENABLED = 'true';
      const { service } = fixture();
      const prepared = await service.prepare(context, request);
      const result = await service.calculate(context, prepared.calculationId);
      expect(result.applyOptions).toHaveLength(1);
      expect(result.applyOptions[0].changes[0]).toMatchObject({
        metric: 'LTHR',
        value: 165,
        delta: -11,
      });
      expect(result.noMetricWrite).toBe(true);

      process.env.FITNESS_LTHR_APPLY_ENABLED = 'false';
      const disabled = fixture().service;
      const ready = await disabled.prepare(context, request);
      const preview = await disabled.calculate(context, ready.calculationId);
      expect(preview.candidates[0].value).toBe(165);
      expect(preview.applyOptions).toEqual([]);
      expect(preview.limitations).toContain('APPLICATION_NOT_ENABLED');
    } finally {
      process.env = previous;
    }
  });
});
