import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const root = new URL('../../../../../packages/prisma/', import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL('core/migrations/manifest.json', root), 'utf8'),
);
const adminUrl = process.env.ACTIVITY_REBIND_TEST_POSTGRES_URL;
let db, socket, admin, url;
const name = `activity_rebind_test_${randomUUID().replaceAll('-', '')}`;
if (adminUrl) {
  const target = new URL(adminUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))
    throw new Error('Loopback test PostgreSQL required');
  const { Client } = createRequire(new URL('package.json', root))('pg');
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  target.pathname = `/${name}`;
  url = target.toString();
  db = new Client({ connectionString: url });
  await db.connect();
} else {
  db = new PGlite();
}
for (const migration of manifest.migrations) {
  // Multi-user isolation tests deliberately omit the single-owner product guard.
  if (migration.id === '0007_single_owner') continue;
  const sql = readFileSync(
    new URL(`core/migrations/${migration.file}`, root),
    'utf8',
  );
  if (admin) await db.query(sql);
  else await db.exec(sql);
}
if (!admin) {
  socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0 });
  await socket.start();
  url = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?connection_limit=1&sslmode=disable`;
}
process.send?.({ url });
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  if (admin) {
    await db.end();
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      [name],
    );
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  } else {
    await socket.stop();
    await db.close();
  }
  process.exit(0);
}
process.on('message', close);
process.on('disconnect', close);
process.on('SIGTERM', close);
