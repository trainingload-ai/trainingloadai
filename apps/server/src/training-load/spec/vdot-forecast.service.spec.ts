import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VdotForecastService } from '../vdot-forecast.service';
import {
  shiftVdotDate,
  VDOT_FORECAST_VERSION,
  VDOT_PERSONAL_FORECAST_VERSION,
} from '@/algorithm/vdot-forecast';
import { metricForecastTool } from '@/api/ai/core/tools/metricForecast.tool';

describe('VDOT forecast query and snapshots', () => {
  const directory = mkdtempSync(join(tmpdir(), 'vdot-forecast-test-'));
  const path = join(directory, 'model.json');
  const cutoff = '2026-11-10';
  const now = new Date('2026-11-11T00:30:00Z');
  const model = {
    schemaVersion: 1,
    modelVersion: `${VDOT_FORECAST_VERSION}-test`,
    trainedThrough: '2026-10-01',
    parameters: {
      phi: 0.9,
      levelVariance: 0.02,
      trendVariance: 0.002,
      observationVariance: 0.2,
    },
    intervalScales: [1.4, 1.5, 1.6, 1.7],
    validation: {
      users: 60,
      counts: [250, 250, 250, 250],
      mae: [0.5, 0.5, 0.5, 0.5],
      baselineMae: [1, 1, 1, 1],
      coverage80: [0.8, 0.8, 0.8, 0.8],
      intervalScore: [2, 2, 2, 2],
      baselineIntervalScore: [3, 3, 3, 3],
      pairedDifferenceUpper95: -0.1,
    },
  };
  beforeAll(() => writeFileSync(path, JSON.stringify(model)));
  afterAll(() => rmSync(directory, { recursive: true }));

  function dependencies(modelPath: string | undefined = path) {
    const rows = Array.from({ length: 42 }, (_, index) => {
      const date = shiftVdotDate(cutoff, -82 + index * 2);
      return {
        id: index,
        startTime: new Date(`${date}T02:00:00Z`),
        endTime: new Date(`${date}T03:00:00Z`),
        elapsedTime: 3600,
        vo2max: { vo2maxVdotByHr: 43 },
        fitnessMetricsSnapshot: {
          resolutionVersion: 5,
          resolvedVo2maxValue: 43,
          resolvedVo2maxSource: 'FACTOR',
        },
      };
    });
    const activities = { findMany: jest.fn().mockResolvedValue(rows) };
    const users = {
      bodyMetrics: () => ({
        findFirst: jest
          .fn()
          .mockResolvedValue({ type: 'TIMEZONE', value: 'Asia/Shanghai' }),
      }),
    };
    const configs = {
      listVersions: jest.fn().mockResolvedValue([]),
      resolveFromVersionsOrDefault: () => ({
        defaultVdotSource: 'FACTOR',
        vo2maxCorrectionFactor: 1,
      }),
    };
    const stored = new Map<string, unknown>();
    const prisma = {
      vdotForecastSnapshot: {
        upsert: jest.fn(async (args) => {
          const key = `${args.create.userId}:${args.create.fingerprint}`;
          if (!stored.has(key)) stored.set(key, { result: args.create.result });
          return stored.get(key);
        }),
      },
    };
    const service = new VdotForecastService(
      activities as never,
      users as never,
      configs as never,
      prisma as never,
      new ConfigService({ VDOT_FORECAST_MODEL_PATH: modelPath }),
    );
    return { service, activities, prisma, rows };
  }

  it('uses the user timezone and reuses an immutable snapshot for matching evidence', async () => {
    const { service, activities, prisma } = dependencies();
    const first = await service.getForecast('runner-one', now);
    const second = await service.getForecast(
      'runner-one',
      new Date(now.getTime() + 60_000),
    );
    expect(first.status).toBe('READY');
    expect(first.cutoffDate).toBe(cutoff);
    expect(second).toEqual(first);
    expect(activities.findMany.mock.calls[0][0].where.AND[0].userId).toBe(
      'runner-one',
    );
    const other = await service.getForecast('runner-two', now);
    expect(other.forecastId).not.toBe(first.forecastId);
    expect(prisma.vdotForecastSnapshot.upsert.mock.calls).toHaveLength(3);
  });

  it('excludes an activity finishing after the cutoff and isolates corrected history', async () => {
    const { service, rows } = dependencies();
    rows.push({
      ...rows[0],
      id: 1000,
      startTime: new Date('2026-11-10T15:59:00Z'),
      endTime: new Date('2026-11-10T16:01:00Z'),
      fitnessMetricsSnapshot: {
        resolutionVersion: 5,
        resolvedVo2maxValue: 99,
        resolvedVo2maxSource: 'FACTOR',
      },
    });
    const points = await service.readObservations(
      'runner-one',
      shiftVdotDate(cutoff, -83),
      cutoff,
      'Asia/Shanghai',
    );
    expect(points.every((point) => point.value === 43)).toBe(true);
    expect(points).toHaveLength(42);
  });

  it('runs the built-in personal model without external files and snapshots its fitted parameters', async () => {
    const { service, prisma } = dependencies('');
    const result = await service.getForecast('runner-one', now);
    expect(result).toMatchObject({
      status: 'READY',
      modelVersion: VDOT_PERSONAL_FORECAST_VERSION,
      modelKind: 'PERSONAL_HISTORY',
      intervalKind: 'REFERENCE',
    });
    expect(result.forecasts).toHaveLength(4);
    expect(result.forecasts[3].point).toBeCloseTo(43);
    const storedInput =
      prisma.vdotForecastSnapshot.upsert.mock.calls[0][0].create.input;
    expect(storedInput.artifact).toBeNull();
    expect(storedInput.personalParameters.observationVariance).toBeGreaterThan(
      0,
    );
    expect(
      await service.getForecast('runner-one', new Date(now.getTime() + 60_000)),
    ).toEqual(result);
  });

  it('keeps an explicitly configured unvalidated model unavailable', async () => {
    const invalidPath = join(directory, 'invalid.json');
    writeFileSync(
      invalidPath,
      JSON.stringify({
        ...model,
        validation: { ...model.validation, users: 1 },
      }),
    );
    const { service, prisma } = dependencies(invalidPath);
    const result = await service.getForecast('runner-one', now);
    expect(result).toMatchObject({
      status: 'MODEL_UNAVAILABLE',
      forecasts: [],
    });
    expect(prisma.vdotForecastSnapshot.upsert).not.toHaveBeenCalled();
  });

  it('keeps the personal model behind the same history coverage gate', async () => {
    const { service, rows, prisma } = dependencies('');
    rows.splice(0, rows.length - 2);
    expect(await service.getForecast('runner-one', now)).toMatchObject({
      status: 'INSUFFICIENT_HISTORY',
      forecasts: [],
    });
    expect(prisma.vdotForecastSnapshot.upsert).not.toHaveBeenCalled();
  });

  it('makes the coach use the same user-scoped service result and enforces sign-in', async () => {
    const output = {
      forecastId: 'one',
      status: 'INSUFFICIENT_HISTORY',
      forecasts: [],
    };
    const getVdotForecast = jest.fn().mockResolvedValue(output);
    const context = {
      session: { user: { id: 'runner-one' } },
      pmc: { getVdotForecast },
    } as never;
    expect(
      await metricForecastTool.execute(context, {
        metric: 'vdot',
        horizonWeeks: 4,
      }),
    ).toBe(output);
    expect(getVdotForecast).toHaveBeenCalledWith('runner-one');
    expect(
      await metricForecastTool.checkPermissions!(
        { session: null, i18n: { t: () => '' } } as never,
        { metric: 'vdot' },
      ),
    ).toMatchObject({ ok: false });
  });
});
