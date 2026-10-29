import { describe, expect, it, jest } from '@jest/globals';
import type { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { RuntimeCapabilityGuard } from './runtime-capability.guard';
import { RuntimeCapabilityService } from './runtime-capability.service';
import { SelfHostRuntimeInitializer } from '@/self-host/self-host-runtime-initializer.service';
import type { SelfHostAiConfigurationService } from '@/self-host/self-host-ai-configuration.service';

async function withEnvironment<T>(
  values: Record<string, string | undefined>,
  run: () => T | Promise<T>,
): Promise<T> {
  const previous = new Map(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('RuntimeCapabilityService', () => {
  it('returns the stable disabled business code', async () => {
    await withEnvironment(
      { SELF_HOST_MODE: 'core-local', AI_PROVIDER: 'none' },
      () => {
        const service = new RuntimeCapabilityService();
        try {
          service.require('ai');
          throw new Error('expected require to throw');
        } catch (error) {
          expect(
            (error as { getResponse: () => unknown }).getResponse(),
          ).toEqual(
            expect.objectContaining({
              code: BUSINESS_ERROR_CODE.CAPABILITY_DISABLED,
            }),
          );
        }
      },
    );
  });

  it('returns the stable misconfigured business code', async () => {
    await withEnvironment(
      { SELF_HOST_MODE: 'extended', AI_PROVIDER: 'unsupported-provider' },
      () => {
        const service = new RuntimeCapabilityService();
        try {
          service.require('ai');
          throw new Error('expected require to throw');
        } catch (error) {
          expect(
            (error as { getResponse: () => unknown }).getResponse(),
          ).toEqual(
            expect.objectContaining({
              code: BUSINESS_ERROR_CODE.CAPABILITY_MISCONFIGURED,
            }),
          );
        }
      },
    );
  });

  it('fails self-host startup on required configuration errors', async () => {
    await withEnvironment(
      {
        SELF_HOST_MODE: 'core-local',
        DATABASE_URL: undefined,
        BETTER_AUTH_SECRET: undefined,
      },
      async () => {
        const service = new RuntimeCapabilityService();
        const initializer = new SelfHostRuntimeInitializer(
          {
            initializeRuntime: jest.fn(async () => undefined),
          } as unknown as SelfHostAiConfigurationService,
          service,
        );
        await expect(initializer.onModuleInit()).rejects.toThrow(
          /SELF_HOST_CONFIG_INVALID: DATABASE_URL is required/,
        );
      },
    );
  });

  it('treats BYOK AI without billing as operator funded only in self-host mode', async () => {
    await withEnvironment(
      {
        SELF_HOST_MODE: 'extended',
        AI_PROVIDER: 'deepseek',
        DEEPSEEK_API_KEY: 'test-deepseek-key',
        DEEPSEEK_DEFAULT_MODEL: 'deepseek-chat',
        DEEPSEEK_REASONING_MODEL: 'deepseek-reasoner',
        BILLING_PROVIDER: 'none',
      },
      () => {
        expect(
          new RuntimeCapabilityService().isSelfHostOperatorFundedAi(),
        ).toBe(true);
      },
    );

    await withEnvironment(
      {
        SELF_HOST_MODE: undefined,
        AI_PROVIDER: 'deepseek',
        DEEPSEEK_API_KEY: 'test-deepseek-key',
        DEEPSEEK_DEFAULT_MODEL: 'deepseek-chat',
        DEEPSEEK_REASONING_MODEL: 'deepseek-reasoner',
        BILLING_PROVIDER: 'none',
      },
      () => {
        expect(
          new RuntimeCapabilityService().isSelfHostOperatorFundedAi(),
        ).toBe(false);
      },
    );
  });
});

describe('RuntimeCapabilityGuard', () => {
  it('enforces controller or route capability metadata', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => 'billing'),
    } as unknown as Reflector;
    const capabilities = {
      require: jest.fn(),
    } as unknown as RuntimeCapabilityService;
    const guard = new RuntimeCapabilityGuard(reflector, capabilities);
    const handler = () => undefined;
    class Controller {}
    const context = {
      getHandler: () => handler,
      getClass: () => Controller,
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(capabilities.require).toHaveBeenCalledWith('billing');
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      'runtime-capability',
      [handler, Controller],
    );
  });
});
