import type { ImportItemJob, ImportSourceObject, Prisma } from '@prisma/client';
import type { UserQueryService } from '@/api/user/user-query.service';
import type { ExternalProviderConnectionService } from '@/integrations/external-provider/external-provider-connection.service';
import { matchesIntervalsAuthorization } from '@/integrations/intervals-icu/intervals-icu-authorization';
import { personalAccountRef } from '@/integrations/personal/personal-identity';
import { asImportJsonRecord } from './import-item-job.types';

export type ImportPublication = ImportItemJob & {
  sourceObject: ImportSourceObject;
};
export interface ImportPublicationAuthorizationExtension {
  sourceKinds: readonly string[];
  assertCurrent(
    tx: Prisma.TransactionClient,
    item: ImportPublication,
  ): Promise<void>;
}

export const IMPORT_PUBLICATION_AUTHORIZATION = Symbol(
  'IMPORT_PUBLICATION_AUTHORIZATION',
);

export async function lockImportConnection(
  tx: Prisma.TransactionClient,
  id: string,
  connections: ExternalProviderConnectionService,
) {
  await tx.$queryRaw`SELECT id FROM t_external_provider_connection WHERE id=${id} FOR SHARE`;
  return connections.model(tx).findUnique({ where: { id } });
}

/** Authorization is checked at the local publication boundary, including cache hits. */
export async function assertImportPublicationAuthorized(
  tx: Prisma.TransactionClient,
  item: ImportPublication,
  users: UserQueryService,
  connections: ExternalProviderConnectionService,
  extension?: ImportPublicationAuthorizationExtension,
) {
  await tx.$queryRaw`SELECT id FROM t_user WHERE id=${item.userId} FOR SHARE`;
  const user = await users.users(tx).findUnique({
    where: { id: item.userId },
    select: { accountDeletionRequestedAt: true },
  });
  if (!user || user.accountDeletionRequestedAt)
    throw new Error('IMPORT_ACCOUNT_NO_LONGER_WRITABLE');
  const ref = asImportJsonRecord(item.sourceRef);
  const replay = asImportJsonRecord(ref.localReplay);
  const repair = asImportJsonRecord(ref.repair);
  if (
    typeof replay.canonicalSnapshotId === 'string' ||
    typeof repair.primarySourceId === 'string'
  ) {
    const source = await tx.activitySource.findFirst({
      where: {
        userId: item.userId,
        sourceObjectId: item.sourceObjectId,
        isActive: true,
        isPrimary: true,
        activity: { state: 1 },
        ...(typeof replay.canonicalSnapshotId === 'string'
          ? {
              activityId: Number(replay.activityId),
              OR: [
                { canonicalSnapshotId: replay.canonicalSnapshotId },
                { canonicalSnapshot: { itemJobId: item.id } },
              ],
            }
          : { id: String(repair.primarySourceId) }),
      },
      select: { id: true },
    });
    if (!source) throw new Error('IMPORT_LOCAL_REPLAY_NO_LONGER_VALID');
    if (
      typeof repair.primarySourceId === 'string' &&
      !(await tx.activityDataMigration.findFirst({
        where: {
          id: String(repair.migrationId),
          userId: item.userId,
          status: 'MIGRATING',
        },
        select: { id: true },
      }))
    )
      throw new Error('IMPORT_LOCAL_REPLAY_NO_LONGER_VALID');
    return;
  }
  if (item.sourceKind === 'INTERVALS_ICU') {
    const expected = asImportJsonRecord(ref.authorization);
    if (typeof expected.connectionId !== 'string')
      throw new Error('IMPORT_AUTHORIZATION_CHANGED');
    const connection = await lockImportConnection(
      tx,
      expected.connectionId,
      connections,
    );
    if (
      !connection ||
      connection.userId !== item.userId ||
      connection.provider !== 'intervals_icu' ||
      !matchesIntervalsAuthorization(expected, connection)
    )
      throw new Error('IMPORT_AUTHORIZATION_CHANGED');
    return;
  }
  if (item.sourceKind === 'GARMIN_PERSONAL_API') {
    const expected = asImportJsonRecord(ref.personalAuthorization);
    if (
      typeof expected.connectionId !== 'string' ||
      typeof expected.fingerprint !== 'string'
    )
      throw new Error('IMPORT_AUTHORIZATION_CHANGED');
    const connection = await lockImportConnection(
      tx,
      expected.connectionId,
      connections,
    );
    const metadata = asImportJsonRecord(connection?.metadata);
    if (
      !connection ||
      connection.userId !== item.userId ||
      connection.provider !== 'garmin' ||
      connection.status !== 'ACTIVE' ||
      metadata.connectionMode !== 'personal_api' ||
      asImportJsonRecord(metadata.settings).activities === false ||
      connection.credentialFingerprint !== expected.fingerprint ||
      personalAccountRef(connection) !== expected.accountRef ||
      item.sourceObject.accountRef !== expected.accountRef
    )
      throw new Error('IMPORT_AUTHORIZATION_CHANGED');
    return;
  }
  if (extension?.sourceKinds.includes(item.sourceKind))
    return extension.assertCurrent(tx, item);
  if (['STRAVA', 'GARMIN'].includes(item.sourceKind))
    throw new Error('IMPORT_AUTHORIZATION_GUARD_UNAVAILABLE');
}

/** Derived inputs retain the grant that produced their payload, never the latest discovery. */
export function inheritedImportAuthorization(sourceRef: unknown) {
  const ref = asImportJsonRecord(sourceRef);
  return Object.fromEntries(
    [
      'authorization',
      'personalAuthorization',
      'garminAuthorization',
      'providerAuthorization',
      'importTrigger',
      'localReplay',
    ]
      .filter((key) => ref[key] !== undefined)
      .map((key) => [key, ref[key]]),
  );
}
