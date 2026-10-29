import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('OAuthModule', () => {
  it('re-exports the public Demo dependency required by feature-scoped guards', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/oauth/oauth.module.ts'),
      'utf8',
    );

    expect(source).toContain(
      'exports: [OAuthBearerService, OAuthHybridAuthGuard, PublicDemoModule]',
    );
  });
});
