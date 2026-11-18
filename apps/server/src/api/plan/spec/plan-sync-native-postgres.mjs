import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// An explicit native binary directory opts into real multi-session row-lock tests.
// Every invocation owns its cluster; no application database or .env is read.
const bin = process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN;
if (!bin) throw new Error('PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN is required');
const directory = mkdtempSync(join(tmpdir(), 'plan-sync-postgres-'));
const data = join(directory, 'data');
const probe = createServer();
await new Promise((done, reject) => {
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', done);
});
const port = probe.address().port;
await new Promise((done) => probe.close(done));
let started = false;
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  if (started)
    execFileSync(
      join(bin, 'pg_ctl'),
      ['-D', data, '-m', 'immediate', '-w', 'stop'],
      { stdio: 'ignore' },
    );
  rmSync(directory, { recursive: true, force: true });
}
process.on('message', () => {
  close();
  process.exit(0);
});
process.on('disconnect', () => {
  close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  close();
  process.exit(0);
});
try {
  execFileSync(
    join(bin, 'initdb'),
    [
      '-D',
      data,
      '-U',
      'postgres',
      '--auth=trust',
      '--locale=C',
      '--encoding=UTF8',
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    join(bin, 'pg_ctl'),
    [
      '-D',
      data,
      '-l',
      join(directory, 'postgres.log'),
      '-w',
      'start',
      '-o',
      `-h 127.0.0.1 -p ${port} -k ${directory} -c fsync=off -c max_connections=12`,
    ],
    { stdio: 'ignore' },
  );
  started = true;
  const migrations = new URL(
    '../../../../../../packages/prisma/core/migrations/',
    import.meta.url,
  );
  const manifest = JSON.parse(
    readFileSync(new URL('manifest.json', migrations), 'utf8'),
  );
  const execute = (sql) =>
    execFileSync(
      'psql',
      [
        '-Xq',
        '-v',
        'ON_ERROR_STOP=1',
        '-h',
        '127.0.0.1',
        '-p',
        String(port),
        '-U',
        'postgres',
        '-d',
        'postgres',
      ],
      {
        input: sql,
        stdio: ['pipe', 'ignore', 'pipe'],
        env: { ...process.env, PGOPTIONS: '' },
      },
    );
  for (const migration of manifest.migrations) {
    if (migration.id === '0007_single_owner') continue;
    execute(readFileSync(new URL(migration.file, migrations), 'utf8'));
  }
  const operationColumn =
    process.env.COACH_RUN_TEST_OPERATION_COLUMN?.trim() || 'operation_id';
  if (!/^[a-z][a-z0-9_]*$/.test(operationColumn)) {
    throw new Error('Invalid coach run test operation column');
  }
  if (operationColumn !== 'operation_id') {
    execute(
      `ALTER TABLE t_coach_run_attempt RENAME COLUMN operation_id TO ${operationColumn}`,
    );
  }
  execute(`ALTER TABLE t_user ALTER COLUMN name SET DEFAULT 'Test athlete';
    ALTER TABLE t_user ALTER COLUMN email_verified SET DEFAULT true;
    ALTER TABLE t_user ALTER COLUMN created_at SET DEFAULT now();
    ALTER TABLE t_user ALTER COLUMN email SET DEFAULT gen_random_uuid()::text;
    ALTER TABLE t_user ALTER COLUMN updated_at SET DEFAULT now();`);
  process.send?.({ address: `127.0.0.1:${port}`, connectionLimit: 4 });
} catch (error) {
  close();
  throw error;
}
