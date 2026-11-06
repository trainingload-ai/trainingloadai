import { NestFactory } from '@nestjs/core';
import { readVerifiedMigrationBackup } from './activity-data-migration-backup';
import { ActivityDataMigrationModule } from './activity-data-migration.module';
import { ActivityDataMigrationService } from './activity-data-migration.service';

const option = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
async function main() {
  const apply = process.argv.includes('--apply');
  const action = option('action') ?? 'status';
  const runKey = option('run-key');
  if (!runKey) throw new Error('ACTIVITY_MIGRATION_RUN_KEY_REQUIRED');
  if (!['status', 'audit-sports'].includes(action) && !apply)
    throw new Error('ACTIVITY_MIGRATION_APPLY_REQUIRED');
  const app = await NestFactory.createApplicationContext(
    ActivityDataMigrationModule,
    { logger: ['warn', 'error'] },
  );
  let lockClient: import('pg').Client | undefined;
  try {
    if (apply) {
      // A separate session protects scan/network work; short DB transactions use
      // another lock key and do not deadlock on this command's connection.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Client } = require('pg') as typeof import('pg');
      lockClient = new Client({ connectionString: process.env.DATABASE_URL });
      await lockClient.connect();
      const result = await lockClient.query(
        "SELECT pg_try_advisory_lock(hashtextextended('activity-data-migration-command',0)) AS acquired",
      );
      if (!result.rows[0]?.acquired)
        throw new Error('ACTIVITY_MIGRATION_COMMAND_BUSY');
    }
    const service = app.get(ActivityDataMigrationService);
    if (action === 'audit-sports') {
      console.log(
        JSON.stringify(await service.auditUnknownSports(option('user-id'))),
      );
      return;
    }
    if (action === 'prepare') {
      const version = option('version');
      const path = option('backup-evidence');
      const users =
        option('user-ids')
          ?.split(',')
          .map((s) => s.trim())
          .filter(Boolean) ?? [];
      if (!version || !path || !users.length)
        throw new Error('ACTIVITY_MIGRATION_PREPARE_ARGUMENTS_REQUIRED');
      const evidence = await readVerifiedMigrationBackup(path);
      await service.prepare(runKey, version, users, evidence);
    } else if (action === 'advance') {
      await service.advance(runKey);
    } else if (action === 'run') {
      const seconds = Number(option('timeout-seconds') ?? 3600);
      if (!Number.isFinite(seconds) || seconds <= 0)
        throw new Error('ACTIVITY_MIGRATION_TIMEOUT_INVALID');
      const deadline = Date.now() + seconds * 1000;
      let previous = '';
      while (Date.now() < deadline) {
        const progress = await service.advance(runKey);
        const rendered = JSON.stringify(progress);
        if (rendered !== previous) console.log(rendered);
        previous = rendered;
        if (progress.completed) break;
        if (Date.now() + 1000 >= deadline)
          throw new Error('ACTIVITY_MIGRATION_TIMEOUT');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } else if (action === 'retry' || action === 'restart-user') {
      const id = option('migration-id');
      const rows = await service.status(runKey);
      if (!id || !rows.some((r) => r.id === id))
        throw new Error('ACTIVITY_MIGRATION_ID_REQUIRED');
      if (action === 'restart-user') {
        if (!process.argv.includes('--accept-current-user-state'))
          throw new Error('ACTIVITY_MIGRATION_RESTART_CONFIRMATION_REQUIRED');
        await service.restartUser(id);
      } else await service.retry(id);
    } else if (action === 'release-recovery-objects') {
      if (!process.argv.includes('--recovery-window-ended'))
        throw new Error(
          'ACTIVITY_MIGRATION_RECOVERY_RELEASE_CONFIRMATION_REQUIRED',
        );
      await service.releaseRecoveryObjects(runKey);
    } else if (action !== 'status')
      throw new Error('ACTIVITY_MIGRATION_ACTION_INVALID');
    console.log(
      JSON.stringify({ ok: true, runKey, users: await service.status(runKey) }),
    );
  } finally {
    await lockClient?.end();
    await app.close();
  }
}
void main().catch((error) => {
  const message = error instanceof Error ? error.message : '';
  console.error(
    JSON.stringify({
      ok: false,
      error: {
        code: /^[A-Z][A-Z0-9_]+$/.test(message)
          ? message
          : 'ACTIVITY_MIGRATION_COMMAND_FAILED',
      },
    }),
  );
  process.exitCode = 1;
});
