import { describe, expect, it } from '@jest/globals';
import archiver = require('archiver');
import { PassThrough } from 'node:stream';
import { extractActivityArchive } from '../personal-archive';

async function zip(files: Array<[string, Buffer]>) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    output.on('data', chunk => chunks.push(chunk));
    output.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
  });
  archive.pipe(output);
  files.forEach(([name, value]) => archive.append(value, { name }));
  await archive.finalize();
  return done;
}
describe('bounded original-activity archives', () => {
  it('extracts the original FIT and does not create duplicate TCX imports', async () => {
    const bytes = Buffer.from('fixture FIT bytes');
    const file = await extractActivityArchive(await zip([['activity.fit', bytes], ['activity.tcx', Buffer.from('<xml/>')]]));
    expect(file.fileName).toBe('activity.fit');
    expect(file.buffer).toEqual(bytes);
  });
  it('rejects ambiguous originals and nested archives', async () => {
    await expect(extractActivityArchive(await zip([['one.fit', Buffer.from('1')], ['two.fit', Buffer.from('2')]]))).rejects.toThrow('PROVIDER_ARCHIVE_INVALID');
    await expect(extractActivityArchive(await zip([['nested.zip', Buffer.from('PK')], ['activity.fit', Buffer.from('1')]]))).rejects.toThrow('PROVIDER_ARCHIVE_INVALID');
  });
  it('rejects extreme decompression ratios before reading the stream', async () => {
    await expect(extractActivityArchive(await zip([['bomb.fit', Buffer.alloc(1024 * 1024)]]))).rejects.toThrow('PROVIDER_ARCHIVE_INVALID');
  });
  it('rejects path traversal without writing anything to disk', async () => {
    const buffer = await zip([['safe.fit', Buffer.from('fit')]]);
    for (let offset = 0; (offset = buffer.indexOf('safe.fit', offset)) >= 0; offset += 8) buffer.write('../x.fit', offset);
    await expect(extractActivityArchive(buffer)).rejects.toThrow('PROVIDER_ARCHIVE_INVALID');
  });
});
