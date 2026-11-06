import { verifiedRawFileSha256 } from '../raw-file-checksum';

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
