import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_ROOT = join(__dirname, '../../..');
const FORBIDDEN = /(?:\(prisma\s+as\s+any\)|\bprisma|\btx)\.activity\b/;
const TARGETS = [
  'api/plan',
  'api/charts',
  'training-load',
  'api/competition',
  'api/ai/core/coach-tools.service.ts',
  'api/ai/core/coach-action.service.ts',
];

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

describe('Activity read-port consumers', () => {
  it('keeps Plan/Charts/PMC/CoachTools/Competition off prisma.activity', () => {
    const files: string[] = [];
    for (const target of TARGETS) {
      const full = join(SRC_ROOT, target);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full, files);
      else files.push(full);
    }
    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(SRC_ROOT, file).split('\\').join('/');
      if (rel.includes('/spec/')) continue;
      if (rel.includes('/persistence/')) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (FORBIDDEN.test(line)) {
          violations.push(`${rel}:${index + 1}:${line.trim()}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
});
