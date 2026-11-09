import * as yauzl from 'yauzl';
import { PersonalProviderError } from './personal-errors';

const MAX_BYTES = 128 * 1024 * 1024;

/** Read in memory; reject traversal, bombs, symlinks, nested archives, and ambiguity. */
export function extractActivityArchive(
  buffer: Buffer,
): Promise<{ buffer: Buffer; fileName: string }> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, archive) => {
        const fail = () => {
          archive?.close();
          reject(new PersonalProviderError('PROVIDER_ARCHIVE_INVALID'));
        };
        if (error || !archive) {
          fail();
          return;
        }
        let entries = 0,
          declaredBytes = 0,
          actualBytes = 0;
        const files: { buffer: Buffer; fileName: string }[] = [];
        archive.on('error', fail);
        archive.on('entry', (entry) => {
          entries++;
          declaredBytes += entry.uncompressedSize;
          const name: string = entry.fileName;
          const unixMode = (entry.externalFileAttributes >>> 16) & 0xf000;
          if (
            entries > 32 ||
            declaredBytes > MAX_BYTES ||
            unixMode === 0xa000 ||
            /(^|[\\/])\.\.([\\/]|$)|^[\\/]|^[A-Za-z]:/.test(name) ||
            entry.generalPurposeBitFlag & 1 ||
            (entry.compressedSize > 0 &&
              entry.uncompressedSize / entry.compressedSize > 500)
          ) {
            fail();
            return;
          }
          if (name.endsWith('/')) {
            archive.readEntry();
            return;
          }
          if (/\.(zip|gz|tar|7z)$/i.test(name)) {
            fail();
            return;
          }
          if (!/\.(fit|tcx|gpx)$/i.test(name)) {
            archive.readEntry();
            return;
          }
          archive.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) {
              fail();
              return;
            }
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => {
              actualBytes += chunk.length;
              if (actualBytes > MAX_BYTES) {
                stream.destroy();
                fail();
              } else chunks.push(chunk);
            });
            stream.on('error', fail);
            stream.on('end', () => {
              files.push({
                buffer: Buffer.concat(chunks),
                fileName: name.split(/[\\/]/).pop()!,
              });
              archive.readEntry();
            });
          });
        });
        archive.on('end', () => {
          // FIT is the richest original; duplicates in another format are not separate activities.
          const fits = files.filter((file) => /\.fit$/i.test(file.fileName));
          const candidates = fits.length ? fits : files;
          if (candidates.length !== 1 || !candidates[0].buffer.length) {
            fail();
            return;
          }
          resolve(candidates[0]);
        });
        archive.readEntry();
      },
    );
  });
}
