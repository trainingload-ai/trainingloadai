import type { ExternalProviderConnection } from '@prisma/client';
import { PersonalProviderError, record, requireId } from './personal-errors';

/** Vendor IDs live in a regional API namespace. Credentials, display names
 * and replaceable local connection IDs must not determine source identity. */
export function personalAccountRef(
  connection: Pick<
    ExternalProviderConnection,
    'metadata' | 'externalAthleteId'
  >,
): string {
  const region = record(connection.metadata).region;
  if (!['global', 'cn', 'us', 'eu'].includes(region))
    throw new PersonalProviderError('PROVIDER_REGION_INVALID');
  return `${region}:${requireId(connection.externalAthleteId)}`;
}
