import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const database = new PGlite();
const socket = new PGLiteSocketServer({
  db: database,
  host: '127.0.0.1',
  port: 0,
});

function run(command, args, options) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, options);
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else {
        rejectRun(
          new Error(
            `${command} exited with ${code ?? `signal ${signal ?? 'unknown'}`}`,
          ),
        );
      }
    });
  });
}

try {
  await socket.start();
  const address = socket.getServerConn();
  const databaseUrl = `postgresql://postgres:postgres@${address}/postgres?sslmode=disable`;
  await run(
    'pnpm',
    [
      '--dir',
      'packages/prisma',
      'exec',
      'prisma',
      'db',
      'push',
      '--schema',
      'core/schema.prisma',
      '--skip-generate',
    ],
    {
      cwd: repositoryRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    },
  );

  const result = await database.query(`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('t_user', 't_activity')
    ORDER BY tablename
  `);
  const tables = result.rows.map((row) => row.tablename);
  if (tables.join(',') !== 't_activity,t_user') {
    throw new Error(
      `Core tables missing after PGlite initialization: ${tables}`,
    );
  }
  process.stdout.write('Core Prisma schema: PGlite initialization PASS\n');
} finally {
  await socket.stop().catch(() => undefined);
  await database.close().catch(() => undefined);
}
