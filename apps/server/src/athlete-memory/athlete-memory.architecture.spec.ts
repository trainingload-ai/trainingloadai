import { describe, expect, it } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('Athlete Memory architecture boundary', () => {
  it('keeps domain policy independent from NestJS, Prisma and AI integration', () => {
    const domainDir = join(__dirname, 'domain');
    for (const file of readdirSync(domainDir).filter((name) =>
      name.endsWith('.ts'),
    )) {
      const source = readFileSync(join(domainDir, file), 'utf8');
      expect(source).not.toMatch(/@nestjs|@prisma|api\/ai/);
    }
  });

  it('keeps the feature module free of reverse AI and HealthData imports', () => {
    const source = readFileSync(
      join(__dirname, 'athlete-memory.module.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/api\/ai|health-data/i);
  });
});
