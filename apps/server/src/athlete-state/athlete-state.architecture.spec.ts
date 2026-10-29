import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';

function source(path: string) {
  return readFileSync(join(__dirname, path), 'utf8');
}

describe('AthleteState module boundaries', () => {
  it('does not depend on AiModule or the AI API layer', () => {
    const moduleSource = source('athlete-state.module.ts');

    expect(moduleSource).not.toContain('AiModule');
    expect(moduleSource).not.toContain("from '@/api/ai");
  });

  it('keeps Prisma access inside infrastructure', () => {
    const applicationDirectory = join(__dirname, 'application');
    const applicationSources = readdirSync(applicationDirectory)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .map((file) => readFileSync(join(applicationDirectory, file), 'utf8'));

    for (const applicationSource of applicationSources) {
      expect(applicationSource).not.toContain('PrismaService');
      expect(applicationSource).not.toMatch(/prisma\.[a-zA-Z]/);
    }
  });
});
