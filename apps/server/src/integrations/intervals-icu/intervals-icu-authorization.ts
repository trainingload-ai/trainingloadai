import type { ExternalProviderConnection } from '@prisma/client';
import { intervalsIcuMetadataOf } from './intervals-icu-metadata';

type Connection = Pick<
  ExternalProviderConnection,
  'id' | 'userId' | 'credentialFingerprint'
> & { externalAthleteId?: string | null; metadata?: unknown };
export type IntervalsAuthorization = {
  connectionId: string;
  userId: string;
  athleteId: string;
  revision: string;
};
export function intervalsAuthorization(
  connection: Connection,
): IntervalsAuthorization {
  const revision = intervalsIcuMetadataOf(connection).authorizationRevision;
  return {
    connectionId: connection.id,
    userId: connection.userId,
    athleteId: connection.externalAthleteId ?? '',
    revision:
      typeof revision === 'string'
        ? revision
        : (connection.credentialFingerprint ?? ''),
  };
}
export function matchesIntervalsAuthorization(
  expected: unknown,
  current: Connection & { status: string },
): boolean {
  if (!expected || typeof expected !== 'object' || current.status !== 'ACTIVE')
    return false;
  const value = expected as IntervalsAuthorization,
    actual = intervalsAuthorization(current);
  return (
    !!value.revision &&
    !!value.athleteId &&
    value.connectionId === actual.connectionId &&
    value.userId === actual.userId &&
    value.athleteId === actual.athleteId &&
    value.revision === actual.revision
  );
}
