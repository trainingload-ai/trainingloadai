import { AlgorithmService } from '@/analyze/algorithm.service';
import { AnalyzePersistenceService } from '@/analyze/analyze-persistence.service';
import type { MetricsContext } from '@/api/activity/metrics/context';
import { ActivityMetricsOrchestratorService } from '@/api/activity/metrics/orchestrator.service';
import { ActivityPeakMetricWriterService } from '@/api/activity/metrics/shared/peak-metric-writer.service';
import { ActivityPerformanceTTWriterService } from '@/api/activity/metrics/shared/performance-tt-writer.service';
import { DerivedMetricsTask } from '@/api/activity/metrics/tasks/derived-metrics.task';
import { EstimatedPowerMetricsTask } from '@/api/activity/metrics/tasks/estimated-power-metrics.task';
import { LthrObservationTask } from '@/api/activity/metrics/tasks/lthr-observation.task';
import { MaxMeanHeartRateTask } from '@/api/activity/metrics/tasks/max-mean-heart-rate.task';
import { PeakPaceTask } from '@/api/activity/metrics/tasks/peak-pace.task';
import { RecordsBootstrapTask } from '@/api/activity/metrics/tasks/records-bootstrap.task';
import { Vo2MaxTask } from '@/api/activity/metrics/tasks/vo2max.task';
import type { PrismaService } from '@/prisma/prisma.service';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

describe('Imported activity LIGHT metrics publication', () => {
  let database: ChildProcess;
  let prisma: PrismaService;
  const userId = 'light-publication-fixture';

  beforeAll(async () => {
    database = fork(resolve(__dirname, 'account-rebind-database.mjs'), [], {
      execArgv: [],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    const url = await new Promise<string>((done, fail) => {
      database.once('message', (message: { url: string }) => done(message.url));
      database.once('error', fail);
      database.once('exit', (code) =>
        fail(new Error(`Test database exited: ${code}`)),
      );
    });
    prisma = new PrismaClient({ datasourceUrl: url }) as PrismaService;
    await prisma.t_user.create({
      data: {
        id: userId,
        name: 'Fixture',
        email: 'light-publication@fixtures.invalid',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (database && database.exitCode === null) {
      await new Promise<void>((done) => {
        database.once('exit', () => done());
        database.send('close');
      });
    }
  });

  it.each(['heart rate', 'pace'] as const)(
    'publishes %s and subsequent metrics within one transaction',
    async (kind) => {
      const activity = await prisma.activity.create({
        data: {
          userId,
          hashId: kind,
          sportType: 'RUN',
          distance: 1000,
          ecp: 250,
        },
      });
      const peakWriter = new ActivityPeakMetricWriterService(prisma);
      const ttWriter = new ActivityPerformanceTTWriterService(prisma);
      const derivedMetrics = new DerivedMetricsTask(
        new AlgorithmService(),
        { getAvgLeftRightBalance: async () => 51 } as never,
        prisma,
      );
      const tasks = [
        new RecordsBootstrapTask({} as never, prisma),
        new MaxMeanHeartRateTask(peakWriter),
        new LthrObservationTask(new AnalyzePersistenceService(prisma)),
        new PeakPaceTask({} as never, peakWriter, ttWriter),
        new EstimatedPowerMetricsTask({} as never, prisma),
        derivedMetrics,
        new Vo2MaxTask({} as never, {} as never, {} as never, prisma),
      ];
      const context: MetricsContext = {
        inputs: {
          activity,
          userId,
          sportType: 'RUN',
          measuredPowerEvidence: kind === 'pace' ? 'RELIABLE' : 'UNKNOWN',
        },
        cache: { sampleSec: 1 },
        outputs: {
          ...(kind === 'heart rate'
            ? { maxMeanHeartRate: { '5m': 145 } }
            : {
                peakPace: { TIME: { '5m': 4 }, bestDistances: { '5m': 1200 } },
              }),
          vo2max: { vo2maxVdotByHr: 45 },
        },
        errors: {},
      };
      const orchestrator = new ActivityMetricsOrchestratorService();
      // The sample interval write takes the same fitness evidence lock as the
      // peak triggers. A separate connection would wait for this transaction.
      const computed = await orchestrator.computeStrict(context, [
        derivedMetrics,
      ]);
      const readActivity = () =>
        prisma.activity.findUniqueOrThrow({
          where: { id: activity.id },
        });
      await expect(readActivity()).resolves.toMatchObject({
        effectiveDistance: null,
        avgLeftRightBalance: null,
      });
      const run = { context: computed.context, tasks };
      const transactionOptions = { timeout: 1_000 };
      const where = { activityId: activity.id };
      await expect(
        prisma.$transaction(async (tx) => {
          await orchestrator.commitComputed(run, tx);
          throw new Error('fixture rollback');
        }, transactionOptions),
      ).rejects.toThrow('fixture rollback');
      await expect(readActivity()).resolves.toMatchObject({
        effectiveDistance: null,
        avgLeftRightBalance: null,
      });
      await expect(prisma.activityPeakMetric.count({ where })).resolves.toBe(0);
      await expect(prisma.activityPerformanceTT.count({ where })).resolves.toBe(
        0,
      );

      await prisma.$transaction(
        (tx) => orchestrator.commitComputed(run, tx),
        transactionOptions,
      );
      await expect(
        prisma.activity.findUnique({ where: { id: activity.id } }),
      ).resolves.toMatchObject({
        sampleSec: 1,
        effectiveDistance: 1000,
        avgLeftRightBalance: 51,
        ecp: kind === 'pace' ? 250 : null,
      });
      await expect(
        prisma.activityPeakMetric.findMany({
          where: { activityId: activity.id },
        }),
      ).resolves.toMatchObject([
        { type: kind === 'heart rate' ? 'hr' : 'pace', scaleValue: 300 },
      ]);
      await expect(
        prisma.activityVO2Max.findUnique({
          where: { activityId: activity.id },
        }),
      ).resolves.toMatchObject({ vo2maxVdotByHr: 45 });
      if (kind === 'pace') {
        await expect(
          prisma.activityPerformanceTT.findMany({
            where: { activityId: activity.id },
          }),
        ).resolves.toMatchObject([
          { targetScaleValue: 300, resultDistanceM: 1200 },
        ]);
      }
    },
    20_000,
  );
});
