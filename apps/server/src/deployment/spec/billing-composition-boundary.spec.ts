import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';

function productionSources(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === 'spec' || entry === '__tests__') continue;
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) {
      productionSources(path, files);
    } else if (path.endsWith('.ts') && !path.endsWith('.spec.ts')) {
      files.push(path);
    }
  }
  return files;
}

describe('billing deployment composition boundary', () => {
  it('uses separate Managed and Self-host composition roots', () => {
    const appModule = readFileSync(
      resolve(__dirname, '../../app.module.ts'),
      'utf8',
    );
    const selfHostRoot = readFileSync(
      resolve(__dirname, '../../self-host-app.module.ts'),
      'utf8',
    );

    expect(appModule).not.toMatch(
      /ManagedBilling|SelfHostBilling|managed\/billing/,
    );
    expect(selfHostRoot).toContain('SelfHostAccessModule');
    expect(selfHostRoot).not.toMatch(/ManagedBilling|managed\/billing/);
  });

  it('keeps account and AI features on stable billing boundaries', () => {
    const sourceRoot = resolve(__dirname, '../..');
    const accountDeletion = readFileSync(
      resolve(sourceRoot, 'api/user/account-deletion.service.ts'),
      'utf8',
    );
    const usersModule = readFileSync(
      resolve(sourceRoot, 'api/user/user.module.ts'),
      'utf8',
    );
    const aiModule = readFileSync(
      resolve(sourceRoot, 'api/ai/ai.module.ts'),
      'utf8',
    );

    for (const source of [accountDeletion, usersModule]) {
      expect(source).not.toMatch(
        /revenuecat\.client|waffo\.client|creem-subscription-cancellation|cloud-billing-provider/,
      );
    }
    expect(aiModule).not.toContain('BillingEntitlementsModule');
    expect(aiModule).not.toContain('MembershipAccessModule');
    expect(aiModule).not.toContain('CloudBillingProviderModule');
    expect(
      existsSync(resolve(sourceRoot, 'billing/billing-core.module.ts')),
    ).toBe(false);
    expect(
      existsSync(
        resolve(sourceRoot, 'deployment/billing-composition.module.ts'),
      ),
    ).toBe(false);
  });

  it('forbids Core production modules from importing the Managed tree', () => {
    const sourceRoot = resolve(__dirname, '../..');
    const managedEntrypoints = new Set([
      resolve(sourceRoot, 'main.ts'),
      resolve(
        sourceRoot,
        'public-demo/activate-public-demo-dataset.command.ts',
      ),
      resolve(sourceRoot, 'public-demo/publish-public-demo-dataset.command.ts'),
    ]);
    const violations = productionSources(sourceRoot)
      .filter((file) => !managedEntrypoints.has(file))
      .filter((file) =>
        /(?:from|import\()\s*['"](?:@managed-server|@starshards\/managed-server)/.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => relative(sourceRoot, file));

    expect(violations).toEqual([]);
  });
});
