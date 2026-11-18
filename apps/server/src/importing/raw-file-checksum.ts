import { ImportSourceKind, ThirdPartyProvider } from '@prisma/client';
import { ImportSourceObjectType } from './import-item-job.types';
import { createHash } from 'node:crypto';

export type LegacyDiscoveryIntegrityAudit = {
  sourceObjectId: string;
  basis: 'LEGACY_DISCOVERY_CHECKSUM';
  registeredDiscoveryChecksum: string;
  observedFileSha256: string;
  fileChecksumStatus: 'OBSERVED_LEGACY_FILE' | 'VERIFIED_PRIMARY_DIGEST';
};

export function fitSegmentChecksum(containerSha256: string, index: number) {
  return createHash('sha256')
    .update(`${containerSha256}#${index}`)
    .digest('hex');
}

/** Old Intervals discovery rows stored the list digest in the file-digest column. */
export function resolveRawFileIntegrity(
  buffer: Buffer,
  source: {
    id: string;
    sourceKind: string;
    provider: string | null;
    objectType: string;
    sourceUid?: string;
    rawChecksum: string | null;
    metadata: unknown;
    activitySources: Array<{
      sourceChecksum: string | null;
      sourceUid?: string;
      metadata?: unknown;
    }>;
  },
): { sha256: string; audit?: LegacyDiscoveryIntegrityAudit } {
  const metadata = source.metadata as { listChecksum?: unknown } | null;
  const discoveryOnly =
    source.sourceKind === ImportSourceKind.INTERVALS_ICU &&
    source.provider === ThirdPartyProvider.intervals_icu &&
    source.objectType === ImportSourceObjectType.THIRD_PARTY_ACTIVITY_FILE &&
    typeof source.rawChecksum === 'string' &&
    /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(source.rawChecksum) &&
    metadata?.listChecksum === source.rawChecksum &&
    source.activitySources.length > 0;
  if (!discoveryOnly) {
    return { sha256: verifiedRawFileSha256(buffer, source.rawChecksum) };
  }

  const sha256 = verifiedRawFileSha256(buffer, null);
  const primaryDigests = source.activitySources.filter(
    (primary) => primary.sourceChecksum != null,
  );
  for (const primary of primaryDigests) {
    const prefix = source.sourceUid ? `${source.sourceUid}#` : undefined;
    const index =
      prefix && primary.sourceUid?.startsWith(prefix)
        ? primary.sourceUid.slice(prefix.length)
        : '';
    const primaryMetadata = primary.metadata as {
      containerChecksum?: unknown;
    } | null;
    // Multi-session imports hash the container plus the session index.
    if (
      /^(0|[1-9]\d*)$/.test(index) &&
      Number.isSafeInteger(Number(index)) &&
      primaryMetadata?.containerChecksum === sha256 &&
      primary.sourceChecksum === fitSegmentChecksum(sha256, Number(index))
    ) {
      continue;
    }
    verifiedRawFileSha256(buffer, primary.sourceChecksum);
  }
  return {
    sha256,
    audit: {
      sourceObjectId: source.id,
      basis: 'LEGACY_DISCOVERY_CHECKSUM',
      registeredDiscoveryChecksum: source.rawChecksum,
      observedFileSha256: sha256,
      fileChecksumStatus: primaryDigests.length
        ? 'VERIFIED_PRIMARY_DIGEST'
        : 'OBSERVED_LEGACY_FILE',
    },
  };
}

/** Validate stored integrity metadata and retain SHA-256 for new identities. */
export function verifiedRawFileSha256(
  buffer: Buffer,
  storedChecksum: string | null | undefined,
): string {
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  if (!storedChecksum) return sha256;

  // Older uploads registered MD5; newer uploads register SHA-256. Never compare
  // different algorithms or rewrite the registered checksum to make it pass.
  const actual = /^[a-f0-9]{64}$/i.test(storedChecksum)
    ? sha256
    : /^[a-f0-9]{32}$/i.test(storedChecksum)
      ? createHash('md5').update(buffer).digest('hex')
      : null;
  if (actual === null || actual !== storedChecksum.toLowerCase()) {
    throw new Error('RAW_CHECKSUM_MISMATCH');
  }
  return sha256;
}
