import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_ROOT = join(__dirname, '../../..');
const FORBIDDEN =
  /(?:\(prisma\s+as\s+any\)|\bprisma|\btx)\.(t_user|userProfile|userSetting|userBodyMetric|userFitnessMetric)\b/;

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

describe('User identity table ownership boundary', () => {
  it('keeps T_user/profile/setting/body/fitness production access inside api/user/persistence', () => {
    const violations: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).split('\\').join('/');
      if (rel.includes('/spec/')) continue;
      if (rel.startsWith('api/user/persistence/')) continue;
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
