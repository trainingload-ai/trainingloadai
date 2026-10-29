import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_ROOT = join(__dirname, '../../..');
const FORBIDDEN =
  /(?:\(prisma\s+as\s+any\)|\bprisma|\btx)\.planTemplatePreview\b/;

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('Plan template preview table ownership boundary', () => {
  it('keeps planTemplatePreview production access inside plan-template/persistence', () => {
    const violations: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).split('\\').join('/');
      if (rel.includes('/spec/')) continue;
      if (rel.startsWith('api/plan-template/persistence/')) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (FORBIDDEN.test(line)) {
            violations.push(`${rel}:${index + 1}:${line.trim()}`);
          }
        });
    }
    expect(violations).toEqual([]);
  });
});
