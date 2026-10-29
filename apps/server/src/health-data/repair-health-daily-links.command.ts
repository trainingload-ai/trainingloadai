/**
 * 在每日投影资格规则变更后，修复历史每日指标关联。
 *
 * 默认只预览。应用模式通过 PostgreSQL advisory lock 串行执行，解除不再具备
 * 投影资格或已删除的来源事实，并确定性重建所有受影响的每日指标。
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import * as path from 'path';
import configuration from '@/config/config';
import { PrismaService } from '@/prisma/prisma.service';
import { HealthDataRepository } from './persistence/health-data.repository';
import { HealthDataIngestService } from './health-data-ingest.service';
import { RepairHealthDailyLinksModule as RepairHealthDailyLinksFeatureModule } from './repair-health-daily-links.module';

const COMMAND_LOCK_KEY = 'starshards:repair-health-daily-links-v1';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '../../.env'),
      ],
    }),
    RepairHealthDailyLinksFeatureModule,
  ],
})
class RepairHealthDailyLinksModule {}

/** 有界每日关联修复命令的已解析 CLI 选项。 */
type CommandOptions = {
  apply: boolean;
  all: boolean;
  limit: number;
};

function argumentValue(name: string) {
  return process.argv
    .find((argument) => argument.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .trim();
}

function parseOptions(): CommandOptions {
  const rawLimit = argumentValue('--limit');
  const limit = rawLimit === undefined ? 100 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit <= 0 || limit > 10_000) {
    throw new Error('--limit must be an integer between 1 and 10000');
  }
  return {
    apply: process.argv.includes('--apply'),
    all: process.argv.includes('--all'),
    limit,
  };
}

async function acquireCommandLock() {
  // 使用独立 PostgreSQL 会话在整个执行期间持有 advisory lock。
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Client } = require('pg') as typeof import('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query<{ acquired: boolean }>(
    'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
    [COMMAND_LOCK_KEY],
  );
  if (!result.rows[0]?.acquired) {
    await client.end();
    throw new Error('another health daily-link repair is already running');
  }
  return async () => {
    try {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
        COMMAND_LOCK_KEY,
      ]);
    } finally {
      await client.end();
    }
  };
}

/** 执行预览扫描，或执行加锁后的修复事务序列。 */
async function run() {
  const options = parseOptions();
  const app = await NestFactory.createApplicationContext(
    RepairHealthDailyLinksModule,
    { logger: ['error', 'warn'] },
  );
  let releaseLock: (() => Promise<void>) | undefined;
  try {
    const prisma = app.get(PrismaService);
    const healthIngest = app.get(HealthDataIngestService);
    const health = app.get(HealthDataRepository);
    if (options.apply) releaseLock = await acquireCommandLock();

    const normalizeProjectionEligibility = () =>
      prisma.$executeRawUnsafe(`
          UPDATE "t_external_health_sample"
          SET "project_to_daily" = false
          WHERE "project_to_daily" = true
            AND (
              "metric_type"::text = 'HEART_RATE_SAMPLE_BPM'
              OR "metadata"->>'grain' = 'POINT'
              OR "metadata"->>'dailyProjection' = 'disabled_until_increment_semantics_confirmed'
              OR "metadata"->>'normalizationStatus' = 'provider_separate_until_confirmed'
            )
        `);
    let normalizedSourceCount = options.apply
      ? await normalizeProjectionEligibility()
      : 0;
    let scanned = 0;
    let repaired = 0;
    let cursorId: string | undefined;
    const pageSize = Math.min(250, options.all ? 250 : options.limit);

    while (true) {
      const page = await health.samples().findMany({
        where: {
          dailyMetricId: { not: null },
          OR: [{ projectToDaily: false }, { deletedAt: { not: null } }],
          ...(cursorId ? { id: { gt: cursorId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: pageSize,
        select: {
          id: true,
          dailyMetricId: true,
          dailyMetric: {
            select: { userId: true, date: true, metricType: true },
          },
        },
      });
      if (page.length === 0) {
        if (options.apply) {
          const newlyNormalized = await normalizeProjectionEligibility();
          normalizedSourceCount += newlyNormalized;
          if (newlyNormalized > 0) {
            cursorId = undefined;
            continue;
          }
        }
        break;
      }
      scanned += page.length;
      cursorId = page.at(-1)?.id;

      const affected = new Map<
        string,
        { userId: string; date: Date; metricType: string }
      >();
      for (const source of page) {
        if (!source.dailyMetricId || !source.dailyMetric) continue;
        affected.set(source.dailyMetricId, {
          userId: source.dailyMetric.userId,
          date: source.dailyMetric.date,
          metricType: String(source.dailyMetric.metricType),
        });
      }

      if (options.apply) {
        for (const [dailyMetricId, metric] of affected) {
          await health.runTransaction(
            async (tx) => {
              await health.samples(tx).updateMany({
                where: {
                  dailyMetricId,
                  OR: [{ projectToDaily: false }, { deletedAt: { not: null } }],
                },
                data: { dailyMetricId: null },
              });
              await healthIngest.rebuildDailyMetric(
                {
                  userId: metric.userId,
                  localDate: metric.date,
                  metricType: metric.metricType,
                },
                tx,
              );
            },
            { timeout: 30_000 },
          );
          repaired += 1;
        }
      }

      if (!options.all && scanned >= options.limit) break;
    }

    console.log(
      JSON.stringify({
        mode: options.apply ? 'apply' : 'dry-run',
        normalizedSourceCount,
        scannedSourceCount: scanned,
        repairedDailyMetricCount: repaired,
        hasMore: !options.all && scanned >= options.limit,
      }),
    );
  } finally {
    await releaseLock?.();
    await app.close();
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
