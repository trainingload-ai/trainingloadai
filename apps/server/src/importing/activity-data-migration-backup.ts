import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { BackupEvidence } from './activity-data-migration.service';

/** A hand-written JSON assertion is not a verified backup. Recheck both artifacts. */
export async function readVerifiedMigrationBackup(
  path: string,
): Promise<BackupEvidence> {
  const info = await stat(path);
  if (!info.isFile() || (info.mode & 0o077) !== 0)
    throw new Error('ACTIVITY_MIGRATION_BACKUP_PERMISSIONS_INVALID');
  const evidence = JSON.parse(await readFile(path, 'utf8'));
  const archives = [evidence.archive, evidence.secondaryArchive];
  if (
    archives.some((p) => typeof p !== 'string' || !isAbsolute(p)) ||
    archives[0] === archives[1]
  ) {
    throw new Error('ACTIVITY_MIGRATION_BACKUP_ARTIFACTS_REQUIRED');
  }
  for (const archive of archives) {
    const hash = createHash('sha256');
    for await (const part of createReadStream(archive)) hash.update(part);
    if (hash.digest('hex') !== evidence.sha256)
      throw new Error('ACTIVITY_MIGRATION_BACKUP_CHECKSUM_MISMATCH');
  }
  return evidence;
}
