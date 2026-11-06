import {
  verifiedRawFileSha256,
  resolveRawFileIntegrity,
} from '../raw-file-checksum';

const md5 = '900150983cd24fb0d6963f7d28e17f72';
const sha256 =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('verifiedRawFileSha256', () => {
  it.each([md5, sha256, md5.toUpperCase(), sha256.toUpperCase()])(
    'validates registered hex digest %s and returns a SHA-256 identity',
    (checksum) => {
      expect(verifiedRawFileSha256(Buffer.from('abc'), checksum)).toBe(sha256);
    },
  );

  it.each([md5, sha256])('rejects altered bytes for %s', (checksum) => {
    expect(() => verifiedRawFileSha256(Buffer.from('abd'), checksum)).toThrow(
      'RAW_CHECKSUM_MISMATCH',
    );
  });

  it.each([
    'invalid',
    'z'.repeat(32),
    'z'.repeat(64),
    '0'.repeat(40),
    ` ${md5}`,
  ])('rejects unrecognized checksum metadata %s', (checksum) => {
    expect(() => verifiedRawFileSha256(Buffer.from('abc'), checksum)).toThrow(
      'RAW_CHECKSUM_MISMATCH',
    );
  });

  it.each([null, undefined, ''])(
    'retains SHA-256 identity generation when no digest was registered: %s',
    (checksum) => {
      expect(verifiedRawFileSha256(Buffer.from('abc'), checksum)).toBe(sha256);
    },
  );
});

describe('legacy discovery checksum provenance', () => {
  const source = () => ({
    id: 'source-1',
    sourceKind: 'INTERVALS_ICU',
    provider: 'intervals_icu',
    objectType: 'third_party_activity_file',
    rawChecksum: '1'.repeat(40),
    metadata: { listChecksum: '1'.repeat(40) },
    activitySources: [{ sourceChecksum: null }],
  });
  it.each([40, 64])(
    'audits a misplaced %s-character list digest without rewriting it',
    (length) => {
      const s = source();
      s.rawChecksum = '1'.repeat(length);
      s.metadata.listChecksum = s.rawChecksum;
      const original = structuredClone(s);
      expect(resolveRawFileIntegrity(Buffer.from('abc'), s)).toEqual({
        sha256,
        audit: {
          sourceObjectId: s.id,
          basis: 'LEGACY_DISCOVERY_CHECKSUM',
          registeredDiscoveryChecksum: s.rawChecksum,
          observedFileSha256: sha256,
          fileChecksumStatus: 'OBSERVED_LEGACY_FILE',
        },
      });
      expect(s).toEqual(original);
    },
  );
  it.each([
    { sourceKind: 'FILE' },
    { provider: 'garmin' },
    { objectType: 'activity_file' },
    { metadata: { listChecksum: '2'.repeat(40) } },
    { metadata: null },
    { activitySources: [] },
    { activitySources: [{ sourceChecksum: 'registered-file-checksum' }] },
  ])('fails closed without the complete discovery provenance: %j', (change) => {
    expect(() =>
      resolveRawFileIntegrity(Buffer.from('abc'), { ...source(), ...change }),
    ).toThrow('RAW_CHECKSUM_MISMATCH');
  });
  it('verifies a PRIMARY file digest registered by an earlier repair on retry', () => {
    const s = { ...source(), activitySources: [{ sourceChecksum: sha256 }] };
    const result = resolveRawFileIntegrity(Buffer.from('abc'), s);
    expect(result.sha256).toBe(sha256);
    expect(result.audit?.fileChecksumStatus).toBe('VERIFIED_PRIMARY_DIGEST');
    expect(() => resolveRawFileIntegrity(Buffer.from('changed'), s)).toThrow(
      'RAW_CHECKSUM_MISMATCH',
    );
  });
  it('keeps genuine file digests strict even when list metadata exists', () => {
    const s = {
      ...source(),
      rawChecksum: sha256,
      metadata: { listChecksum: '1'.repeat(40) },
    };
    expect(resolveRawFileIntegrity(Buffer.from('abc'), s)).toEqual({ sha256 });
    expect(() => resolveRawFileIntegrity(Buffer.from('altered'), s)).toThrow(
      'RAW_CHECKSUM_MISMATCH',
    );
  });
});
