import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { PrismaService } from '@/prisma/prisma.service';
import { SelfHostAiConfigurationService } from './self-host-ai-configuration.service';

const AI_ENV_KEYS = [
  'SELF_HOST_MODE',
  'BETTER_AUTH_SECRET',
  'AI_PROVIDER',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_DEFAULT_MODEL',
  'OPENAI_REASONING_MODEL',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'DEEPSEEK_DEFAULT_MODEL',
  'DEEPSEEK_REASONING_MODEL',
  'AI_DEFAULT_MODEL_CONTEXT_TOKENS',
  'AI_REASONING_MODEL_CONTEXT_TOKENS',
  'AI_WEB_SEARCH_ENABLED',
] as const;

describe('SelfHostAiConfigurationService', () => {
  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of AI_ENV_KEYS) {
      previous.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env.SELF_HOST_MODE = 'core-local';
    process.env.BETTER_AUTH_SECRET = 'c'.repeat(64);
  });

  afterEach(() => {
    for (const key of AI_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    previous.clear();
    jest.restoreAllMocks();
  });

  async function setup(initial: Record<string, unknown>) {
    let row = { ...initial };
    const findUnique = jest.fn(async () => row);
    const update = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => {
        row = { ...row, ...data };
        return row;
      },
    );
    const module = await Test.createTestingModule({
      providers: [
        SelfHostAiConfigurationService,
        {
          provide: PrismaService,
          useValue: {
            selfHostInstance: { findUnique, update },
          },
        },
      ],
    }).compile();
    return {
      service: module.get(SelfHostAiConfigurationService),
      findUnique,
      update,
      row: () => row,
    };
  }

  it('uses deployment configuration until the owner saves an override', async () => {
    process.env.AI_PROVIDER = 'deepseek';
    process.env.DEEPSEEK_API_KEY = 'deployment-secret';
    process.env.DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';
    process.env.DEEPSEEK_REASONING_MODEL = 'deepseek-reasoner';
    const { service } = await setup({
      aiProvider: null,
      aiBaseUrl: null,
      aiDefaultModel: null,
      aiReasoningModel: null,
      aiApiKeyEncrypted: null,
      aiConfigUpdatedAt: null,
    });

    const view = await service.getConfiguration();

    expect(view).toMatchObject({
      source: 'environment',
      provider: 'deepseek',
      apiKeyConfigured: true,
    });
    expect(JSON.stringify(view)).not.toContain('deployment-secret');
  });

  it('encrypts an owner key and applies it to the running process', async () => {
    const { service, row } = await setup({
      aiProvider: null,
      aiBaseUrl: null,
      aiDefaultModel: null,
      aiReasoningModel: null,
      aiApiKeyEncrypted: null,
      aiConfigUpdatedAt: null,
    });

    const view = await service.updateConfiguration({
      provider: 'openai',
      apiKey: 'sk-owner-private',
      baseUrl: 'https://api.openai.com/v1/',
      defaultModel: 'fast-model',
      defaultModelContextTokens: 128_000,
      reasoningModel: 'reasoning-model',
      reasoningModelContextTokens: 256_000,
    });

    expect(view).toMatchObject({
      source: 'owner',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKeyConfigured: true,
    });
    expect(row().aiApiKeyEncrypted).not.toBe('sk-owner-private');
    expect(String(row().aiApiKeyEncrypted)).not.toContain('sk-owner-private');
    expect(process.env.OPENAI_API_KEY).toBe('sk-owner-private');
    expect(process.env.OPENAI_DEFAULT_MODEL).toBe('fast-model');
  });

  it('requires a fresh key when switching providers', async () => {
    const { service } = await setup({
      aiProvider: 'none',
      aiBaseUrl: null,
      aiDefaultModel: null,
      aiReasoningModel: null,
      aiApiKeyEncrypted: null,
      aiConfigUpdatedAt: new Date(),
    });

    await expect(
      service.updateConfiguration({
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        defaultModel: 'deepseek-chat',
        reasoningModel: 'deepseek-reasoner',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps the encrypted key when updating models for the same provider', async () => {
    const initial = await setup({
      aiProvider: null,
      aiBaseUrl: null,
      aiDefaultModel: null,
      aiReasoningModel: null,
      aiApiKeyEncrypted: null,
      aiConfigUpdatedAt: null,
    });
    await initial.service.updateConfiguration({
      provider: 'openai',
      apiKey: 'sk-owner-private',
      defaultModel: 'gpt-6-luna',
      reasoningModel: 'gpt-6.1-sol',
    });
    const encrypted = initial.row().aiApiKeyEncrypted;

    await initial.service.updateConfiguration({
      provider: 'openai',
      defaultModel: 'gpt-6-astra',
      reasoningModel: 'gpt-6.1-sol',
    });

    expect(initial.row().aiApiKeyEncrypted).toBe(encrypted);
    expect(process.env.OPENAI_API_KEY).toBe('sk-owner-private');
    expect(process.env.OPENAI_DEFAULT_MODEL).toBe('gpt-6-astra');
  });

  it('removes the saved credential when the owner disables AI', async () => {
    const configured = await setup({
      aiProvider: null,
      aiBaseUrl: null,
      aiDefaultModel: null,
      aiReasoningModel: null,
      aiApiKeyEncrypted: null,
      aiConfigUpdatedAt: null,
    });
    await configured.service.updateConfiguration({
      provider: 'deepseek',
      apiKey: 'owner-private-key',
      defaultModel: 'deepseek-flash',
      reasoningModel: 'deepseek-v4-pro',
    });

    const view = await configured.service.updateConfiguration({
      provider: 'none',
    });

    expect(view).toMatchObject({
      source: 'owner',
      provider: 'none',
      apiKeyConfigured: false,
    });
    expect(configured.row().aiApiKeyEncrypted).toBeNull();
    expect(process.env.DEEPSEEK_API_KEY).toBeUndefined();
  });

  it('keeps the server available when a restored key cannot be decrypted', async () => {
    const first = await setup({
      aiProvider: null,
      aiBaseUrl: null,
      aiDefaultModel: null,
      aiReasoningModel: null,
      aiApiKeyEncrypted: null,
      aiConfigUpdatedAt: null,
    });
    await first.service.updateConfiguration({
      provider: 'deepseek',
      apiKey: 'restored-private-key',
      defaultModel: 'deepseek-flash',
      reasoningModel: 'deepseek-v4-pro',
    });
    const stored = first.row();

    process.env.BETTER_AUTH_SECRET = 'd'.repeat(64);
    const restored = await setup(stored);
    await restored.service.initializeRuntime();

    expect(await restored.service.getConfiguration()).toMatchObject({
      provider: 'deepseek',
      apiKeyConfigured: false,
    });
    expect(process.env.AI_PROVIDER).toBe('none');
    expect(process.env.DEEPSEEK_API_KEY).toBeUndefined();
  });

  it('uses catalog context windows and enables native provider search', async () => {
    const { service, row } = await setup({
      aiProvider: null,
      aiBaseUrl: null,
      aiDefaultModel: null,
      aiReasoningModel: null,
      aiApiKeyEncrypted: null,
      aiConfigUpdatedAt: null,
    });

    const view = await service.updateConfiguration({
      provider: 'deepseek',
      apiKey: 'owner-private-key',
      defaultModel: 'deepseek-flash',
      reasoningModel: 'deepseek-v4-pro',
      webSearchEnabled: true,
    });

    expect(view).toMatchObject({
      provider: 'deepseek',
      defaultModelContextTokens: 1_000_000,
      reasoningModelContextTokens: 1_000_000,
      webSearchEnabled: true,
    });
    expect(row()).toMatchObject({
      aiDefaultModelContextTokens: 1_000_000,
      aiReasoningModelContextTokens: 1_000_000,
      aiWebSearchEnabled: true,
    });
    expect(process.env.AI_WEB_SEARCH_ENABLED).toBe('true');
  });

  it('keeps custom compatible providers generic and requires explicit context', async () => {
    const { service } = await setup({
      aiProvider: null,
      aiBaseUrl: null,
      aiDefaultModel: null,
      aiReasoningModel: null,
      aiApiKeyEncrypted: null,
      aiConfigUpdatedAt: null,
    });

    await expect(
      service.updateConfiguration({
        provider: 'custom-openai-compatible',
        baseUrl: 'https://models.example.test/v1',
        defaultModel: 'small-vendor-fast',
        reasoningModel: 'small-vendor-reasoning',
      }),
    ).rejects.toThrow('Context window is required for a custom AI model');

    await expect(
      service.updateConfiguration({
        provider: 'custom-openai-compatible',
        baseUrl: 'https://models.example.test/v1',
        defaultModel: 'small-vendor-fast',
        defaultModelContextTokens: 128_000,
        reasoningModel: 'small-vendor-reasoning',
        reasoningModelContextTokens: 256_000,
        webSearchEnabled: true,
      }),
    ).rejects.toThrow(
      'Web search is not supported for the selected AI provider',
    );
  });
});
