import { describe, expect, it } from '@jest/globals';
import { isZipSignature } from '../zip.util';

describe('zip util', () => {
  it('accepts standard, empty, and spanned zip signatures', () => {
    expect(isZipSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(isZipSignature(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true);
    expect(isZipSignature(Buffer.from([0x50, 0x4b, 0x07, 0x08]))).toBe(true);
  });

  it('rejects short, null, and non-zip headers', () => {
    expect(isZipSignature(null)).toBe(false);
    expect(isZipSignature(undefined)).toBe(false);
    expect(isZipSignature(Buffer.from([0x50, 0x4b]))).toBe(false);
    expect(isZipSignature(Buffer.from([0x50, 0x4b, 0x01, 0x02]))).toBe(false);
    expect(isZipSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(false);
  });
});
