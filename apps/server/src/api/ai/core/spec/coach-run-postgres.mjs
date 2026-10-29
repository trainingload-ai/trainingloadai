import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFileSync } from 'node:fs';

// Dedicated test process avoids Jest's VM/dynamic-WASM-import limitation.
const db = new PGlite();
const migrationRoot = new URL('../../../../../../../packages/prisma/core/migrations/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', migrationRoot), 'utf8'));
// Domain authorization tests intentionally model two athletes; the Self-host
// singleton constraint is separately exercised by migration/bootstrap tests.
for (const entry of manifest.migrations) {
  if (entry.id === '0007_single_owner') continue;
  await db.exec(readFileSync(new URL(entry.file, migrationRoot), 'utf8'));
}
await db.exec(`ALTER TABLE t_user ALTER COLUMN name SET DEFAULT 'Test athlete';
  ALTER TABLE t_user ALTER COLUMN email_verified SET DEFAULT true;
  ALTER TABLE t_user ALTER COLUMN created_at SET DEFAULT now();
  ALTER TABLE t_user ALTER COLUMN email SET DEFAULT gen_random_uuid()::text;
  ALTER TABLE t_user ALTER COLUMN updated_at SET DEFAULT now();`);
const socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0 });
await socket.start();
process.send?.({ address: socket.getServerConn() });
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await socket.stop();
  await db.close();
  process.exit(0);
}
process.on('message', close);
process.on('disconnect', close);
process.on('SIGTERM', close);
