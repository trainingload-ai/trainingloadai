import { randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

// Only the explicit test service is used; application DATABASE_URL is ignored.
const address = new URL(process.env.CORE_MIGRATION_TEST_POSTGRES_URL ?? '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(address.hostname)) {
  throw new Error(
    'Recompute tests require an explicit loopback PostgreSQL service',
  );
}
const name = `activity_recompute_test_${process.pid}_${randomBytes(5).toString('hex')}`;
const admin = new pg.Client({ connectionString: address.href });
let created = false;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try {
    if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
  process.exit(0);
}
process.on('message', () => void close());
process.on('disconnect', () => void close());
process.on('SIGTERM', () => void close());
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  // Catch raw timestamp conversions even when CI's host timezone is UTC.
  await admin.query(`ALTER DATABASE "${name}" SET timezone = 'Asia/Shanghai'`);
  address.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: address.href });
  await client.connect();
  try {
    const root = new URL(
      '../../../../../packages/prisma/core/migrations/',
      import.meta.url,
    );
    const manifest = JSON.parse(
      await readFile(new URL('manifest.json', root), 'utf8'),
    );
    for (const migration of manifest.migrations) {
      const sql = await readFile(new URL(migration.file, root), 'utf8');
      if (createHash('sha256').update(sql).digest('hex') !== migration.sha256) {
        throw new Error(`Migration checksum mismatch: ${migration.id}`);
      }
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
  process.send?.({ databaseUrl: address.href });
} catch (error) {
  console.error(error);
  await close();
}
