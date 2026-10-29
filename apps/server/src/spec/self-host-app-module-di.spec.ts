import { describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import * as path from 'node:path';
import * as os from 'node:os';

import { LocalAccountDeletionObligationsService } from '../account-lifecycle/local-account-deletion-obligations.service';

jest.mock('@garmin/fitsdk', () => ({
  Encoder: jest.fn(),
  Profile: {},
}));

jest.mock('@thallesp/nestjs-better-auth', () => {
  const { Global, Module } =
    jest.requireActual<typeof import('@nestjs/common')>('@nestjs/common');

  class AuthService {
    readonly api = { getSession: jest.fn() };
  }

  class TestAuthModule {}
  Global()(TestAuthModule);
  Module({ providers: [AuthService], exports: [AuthService] })(TestAuthModule);

  const decorator = () => () => undefined;
  return {
    AuthModule: { forRoot: () => TestAuthModule },
    AuthService,
    AllowAnonymous: decorator,
    Optional: decorator,
    Session: decorator,
  };
});

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn((headers: unknown) => headers),
}));

jest.mock('better-auth/oauth2', () => ({
  verifyBearerToken: jest.fn(),
}));

jest.mock('../auth', () => ({
  getAuthConfig: jest.fn(() => ({})),
  sendOtpEmailInternal: jest.fn(),
}));

describe('self-host AppModule dependency injection', () => {
  it('compiles with the local account billing adapter and no cloud adapter', async () => {
    const previous = {
      SELF_HOST_MODE: process.env.SELF_HOST_MODE,
      BILLING_PROVIDER: process.env.BILLING_PROVIDER,
      STORAGE_STRATEGY: process.env.STORAGE_STRATEGY,
      LOCAL_STORAGE_PATH: process.env.LOCAL_STORAGE_PATH,
    };
    process.env.SELF_HOST_MODE = 'core-local';
    process.env.BILLING_PROVIDER = 'none';
    process.env.STORAGE_STRATEGY = 'LOCAL';
    process.env.LOCAL_STORAGE_PATH = path.join(
      os.tmpdir(),
      'starshards-self-host-app-module-di-storage',
    );

    const { SelfHostAppModule } = await import('../self-host-app.module');
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [SelfHostAppModule],
      }).compile();

      expect(
        moduleRef.get(LocalAccountDeletionObligationsService, {
          strict: false,
        }),
      ).toBeInstanceOf(LocalAccountDeletionObligationsService);
      await moduleRef.close();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }, 30_000);
});
