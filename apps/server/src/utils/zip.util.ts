import { promises as fs } from 'fs';

/**
 * True if `bytes` starts with a ZIP local-file / empty-archive / spanned marker
 * (`PK\x03\x04`, `PK\x05\x06`, or `PK\x07\x08`).
 */
export function isZipSignature(
  bytes: ArrayLike<number> | null | undefined,
): boolean {
  if (!bytes || bytes.length < 4) return false;
  return (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  );
}

/** Reads the first 4 bytes of a file and checks for a ZIP signature. */
export async function fileHasZipSignature(filePath: string): Promise<boolean> {
  const handle = await fs.open(filePath, 'r');
  const signature = Buffer.alloc(4);
  try {
    await handle.read(signature, 0, signature.length, 0);
  } finally {
    await handle.close();
  }
  return isZipSignature(signature);
}
