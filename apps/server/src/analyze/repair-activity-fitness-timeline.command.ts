import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import * as path from 'node:path';
import configuration from '@/config/config';
import { PrismaModule } from '@/prisma/prisma.module';
import { LoadReadoutModule } from '@/api/activity/load-readout.module';
import { ActivityTimelineRepairService } from './activity-timeline-repair.service';
import { PmcRepository } from '@/training-load/persistence/pmc.repository';

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
    PrismaModule,
    LoadReadoutModule,
  ],
  providers: [ActivityTimelineRepairService, PmcRepository],
})
class RepairActivityFitnessTimelineCommandModule {}

function readLimit() {
  const raw = process.argv
    .find((argument) => argument.startsWith('--limit='))
    ?.split('=')[1];
  if (raw == null) return 100;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit <= 0 || limit > 10_000) {
    throw new Error('--limit must be an integer between 1 and 10000');
  }
  return limit;
}

async function run() {
  const apply = process.argv.includes('--apply');
  if(apply)throw new Error('PER_USER_ACTIVITY_DATA_MIGRATION_REQUIRED');
  const limit = readLimit();
  const app = await NestFactory.createApplicationContext(
    RepairActivityFitnessTimelineCommandModule,
    { logger: ['error', 'warn'] },
  );
  try {
    const repair = app.get(ActivityTimelineRepairService);
    const findings = await repair.scan(limit);
    const queued = apply
      ? await repair.enqueue(findings)
      : { created: 0, updated: 0, running: 0 };
    console.log(
      JSON.stringify({
        schemaVersion: 1,
        mode: apply ? 'apply' : 'dry-run',
        findingCount: findings.length,
        affectedActivityCount: findings.reduce(
          (sum, finding) => sum + finding.affectedActivities,
          0,
        ),
        findings: findings.map((finding) => ({
          userId: finding.userId,
          effectiveFrom: finding.effectiveFrom.toISOString(),
          affectedActivities: finding.affectedActivities,
          reasons: finding.reasons,
        })),
        queued,
      }),
    );
  } finally {
    await app.close();
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
