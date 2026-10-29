import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_ROOT = join(__dirname, '../..');
const FORBIDDEN =
  /(?:\(prisma\s+as\s+any\)|\bprisma|\btx)\.(reviewDigest|reviewDigestSnapshot|reviewDigestTotalsBySport|reviewDigestHighlightActivity)\b/;

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
      continue;
    }
    if (!full.endsWith('.ts')) continue;
    if (full.endsWith('.spec.ts')) continue;
    files.push(full);
  }
  return files;
}

describe('Review digest table ownership boundary', () => {
  it('keeps reviewDigest* production access inside review/persistence', () => {
    const violations: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).split('\\').join('/');
      if (rel.includes('/spec/')) continue;
      if (rel.startsWith('review/persistence/')) continue;
      const text = readFileSync(file, 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, index) => {
        if (FORBIDDEN.test(line)) {
          violations.push(`${rel}:${index + 1}:${line.trim()}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
});
