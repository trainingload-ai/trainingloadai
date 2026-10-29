import { describe, expect, it } from '@jest/globals';
import {
  createContentDisposition,
  createSafeFilename,
  getFileNameWithoutExtension,
} from '../filename.util';

describe('filename util', () => {
  it('returns download defaults for empty filenames', () => {
    expect(createSafeFilename('')).toEqual({
      safeFilename: 'download',
      encodedFilename: 'download',
    });
  });

  it('sanitizes unsafe header filename characters while preserving encoded filename', () => {
    expect(createSafeFilename(' report(最终)*.fit\u0000 ')).toEqual({
      safeFilename: 'report_.fit',
      encodedFilename: '%20report%28%E6%9C%80%E7%BB%88%29%2A.fit%20',
    });
  });

  it('collapses underscores, trims them, and limits safe filename length', () => {
    const result = createSafeFilename(`__${'a'.repeat(120)}!!!.fit`);

    expect(result.safeFilename).toHaveLength(100);
    expect(result.safeFilename).toBe('a'.repeat(100));
    expect(result.encodedFilename).toContain('a'.repeat(100));
  });

  it('builds a content-disposition header with ascii and encoded variants', () => {
    expect(createContentDisposition('计划 01.fit')).toBe(
      'attachment; filename="01.fit"; filename*=UTF-8\'\'%E8%AE%A1%E5%88%92%2001.fit',
    );
  });

  it('removes only the final extension from filenames', () => {
    expect(getFileNameWithoutExtension('activity.fit')).toBe('activity');
    expect(getFileNameWithoutExtension('archive.tar.gz')).toBe('archive.tar');
    expect(getFileNameWithoutExtension('archive.tar.gz', '')).toBe(
      'archivetar',
    );
    expect(getFileNameWithoutExtension('README')).toBe('README');
    expect(getFileNameWithoutExtension('')).toBe('');
  });
});
