import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_DEMO_RUNTIME } from '../../public-demo/public-demo-runtime.port';

describe('OAuthModule', () => {
  it('exports a runtime token that a deployment can provide with useExisting', () => {
    const { exports } = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(exports['./public-demo/public-demo-runtime.port']).toEqual({
      types: './src/public-demo/public-demo-runtime.port.ts',
      default: './src/public-demo/public-demo-runtime.port.ts',
    });
    expect(typeof PUBLIC_DEMO_RUNTIME).toBe('symbol');
  });
});
