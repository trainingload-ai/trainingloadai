import { createHash } from 'node:crypto';

export type LegacyDiscoveryIntegrityAudit = {
  sourceObjectId: string;
  basis: 'LEGACY_DISCOVERY_CHECKSUM';
  registeredDiscoveryChecksum: string;
  observedFileSha256: string;
  fileChecksumStatus: 'OBSERVED_LEGACY_FILE' | 'VERIFIED_PRIMARY_DIGEST';
};

/** Old Intervals discovery rows stored the list digest in the file-digest column. */
export function resolveRawFileIntegrity(
  buffer: Buffer,
  source: {
    id: string;
    sourceKind: string;
    provider: string | null;
    objectType: string;
    rawChecksum: string | null;
    metadata: unknown;
    activitySources: Array<{ sourceChecksum: string | null }>;
  },
): { sha256: string; audit?: LegacyDiscoveryIntegrityAudit } {
  const metadata = source.metadata as { listChecksum?: unknown } | null;
  const discoveryOnly =
    source.sourceKind === 'INTERVALS_ICU' &&
    source.provider === 'intervals_icu' &&
    source.objectType === 'third_party_activity_file' &&
    typeof source.rawChecksum === 'string' &&
    /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(source.rawChecksum) &&
    metadata?.listChecksum === source.rawChecksum &&
    source.activitySources.length > 0;
  const primaryDigests = source.activitySources
    .map((s) => s.sourceChecksum)
    .filter((s): s is string => s != null);
  // A prior repair may already have registered the file identity on PRIMARY.
  // Validate every such identity before accepting the old discovery column.
  const digests =
    discoveryOnly && primaryDigests.length
      ? primaryDigests
      : [discoveryOnly ? null : source.rawChecksum];
  let sha256 = '';
  for (const digest of digests) sha256 = verifiedRawFileSha256(buffer, digest);
  return {
    sha256,
    ...(discoveryOnly
      ? {
          audit: {
            sourceObjectId: source.id,
            basis: 'LEGACY_DISCOVERY_CHECKSUM' as const,
            registeredDiscoveryChecksum: source.rawChecksum!,
            observedFileSha256: sha256,
            fileChecksumStatus: primaryDigests.length
              ? ('VERIFIED_PRIMARY_DIGEST' as const)
              : ('OBSERVED_LEGACY_FILE' as const),
          },
        }
      : {}),
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
