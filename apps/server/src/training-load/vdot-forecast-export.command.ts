/** Explicitly scoped, read-only export. No application workers are started. */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { PrismaModule } from '@/prisma/prisma.module';
import { UserQueryModule } from '@/api/user/user-query.module';
import { UserQueryService } from '@/api/user/user-query.service';
import { UserAnalysisConfigModule } from '@/api/user/user-analysis-config.module';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { VdotForecastService } from './vdot-forecast.service';
import { shiftVdotDate, prepareVdotHistory } from '@/algorithm/vdot-forecast';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: process.env.DOTENV_CONFIG_PATH,
      expandVariables: true,
    }),
    PrismaModule,
    UserQueryModule,
    UserAnalysisConfigModule,
  ],
  providers: [ActivityReadService, VdotForecastService],
})
class VdotExportModule {}

async function main() {
  const { values } = parseArgs({
    options: {
      'user-id': { type: 'string', multiple: true },
      all: { type: 'boolean' },
      from: { type: 'string' },
      through: { type: 'string' },
      output: { type: 'string' },
    },
  });
  if (
    (values.all && Boolean(values['user-id']?.length)) ||
    (!values.all && !values['user-id']?.length) ||
    !values.from ||
    !values.through ||
    !values.output ||
    shiftVdotDate(values.from, 0) !== values.from ||
    shiftVdotDate(values.through, 0) !== values.through ||
    values.from >= values.through
  )
    throw new Error('VDOT_EXPORT_ARGUMENTS_REQUIRED');
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set('options', '-c default_transaction_read_only=on');
  process.env.DATABASE_URL = url.toString();
  const app = await NestFactory.createApplicationContext(VdotExportModule, {
    logger: false,
  });
  try {
    const users = app.get(UserQueryService);
    const forecast = app.get(VdotForecastService);
    const rows = await users.users().findMany({
      where: values.all ? {} : { id: { in: values['user-id'] } },
      select: { id: true },
    });
    const series = [];
    let eligibleUsers = 0;
    for (const user of rows) {
      const zone = await forecast.userTimezone(user.id);
      const observations = await forecast.readObservations(
        user.id,
        values.from,
        values.through,
        zone,
      );
      if (!observations.length) continue;
      if (prepareVdotHistory(observations, values.through).status === 'READY')
        eligibleUsers++;
      series.push({
        id: createHash('sha256').update(user.id).digest('hex'),
        observations,
      });
    }
    writeFileSync(values.output, JSON.stringify(series), { mode: 0o600 });
    process.stdout.write(
      JSON.stringify({
        ok: true,
        users: series.length,
        eligibleUsers,
        observations: series.reduce(
          (sum, user) => sum + user.observations.length,
          0,
        ),
        from: values.from,
        through: values.through,
      }) + '\n',
    );
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  const code =
    error instanceof Error && /^VDOT_[A-Z_]+$/.test(error.message)
      ? error.message
      : 'VDOT_EXPORT_FAILED';
  process.stderr.write(JSON.stringify({ ok: false, code }) + '\n');
  process.exitCode = 1;
});
