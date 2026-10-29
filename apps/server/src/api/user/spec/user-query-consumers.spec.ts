import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_ROOT = join(__dirname, '../../..');
const REPOSITORY_ROOT = join(SRC_ROOT, '../../..');
const FORBIDDEN =
  /(?:\(prisma\s+as\s+any\)|\bprisma|\btx)\.(t_user|userProfile|userSetting|userBodyMetric|userFitnessMetric)\b/;
const TARGETS = [
  join(SRC_ROOT, 'oauth'),
  join(SRC_ROOT, 'auth/account-deletion-auth-guard.ts'),
  join(SRC_ROOT, 'training-load'),
  join(SRC_ROOT, 'timezone'),
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

describe('User query-port consumers', () => {
  it('keeps OAuth/guard/PMC/timezone consumers off direct User tables', () => {
    const files: string[] = [];
    for (const target of TARGETS) {
      const stat = statSync(target);
      if (stat.isDirectory()) walk(target, files);
      else files.push(target);
    }
    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(REPOSITORY_ROOT, file).split('\\').join('/');
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
