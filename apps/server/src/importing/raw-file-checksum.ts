import { createHash } from 'node:crypto';

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
