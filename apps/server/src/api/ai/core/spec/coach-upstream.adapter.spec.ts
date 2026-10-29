import { afterEach, describe, expect, it } from '@jest/globals';
import {
  buildCoachStreamProviderOptions,
  buildThinkingRequestExtras,
  createCoachClient,
  createCoachLanguageModel,
  getCoachModel,
  getCoachUpstreamProvider,
} from '../coach-upstream.adapter';

describe('AI Coach upstream request options', () => {
  it('uses the top-level DeepSeek thinking extension for direct requests', () => {
    expect(
      buildThinkingRequestExtras({ thinking: false, provider: 'deepseek' }),
    ).toEqual({
      thinking: { type: 'disabled' },
    });
  });

  it('flattens DeepSeek thinking options for AI SDK request bodies', () => {
    expect(
      buildCoachStreamProviderOptions({
        thinking: false,
        provider: 'deepseek',
      }),
    ).toEqual({
      deepseek: { thinking: { type: 'disabled' } },
    });
  });
});

describe('AI Coach self-host provider selection', () => {
  const original = process.env;

  afterEach(() => {
    process.env = original;
  });

  it('does not infer a provider from stale credentials in self-host mode', () => {
    process.env = {
      ...original,
      SELF_HOST_MODE: 'core-local',
      AI_PROVIDER: 'none',
      OPENROUTER_API_KEY: 'stale-secret',
    };
    expect(getCoachUpstreamProvider()).toBeNull();
    expect(() => createCoachClient()).toThrow('SELF_HOST_AI_NOT_CONFIGURED');
  });

  it('supports an explicit custom OpenAI-compatible provider', () => {
    process.env = {
      ...original,
      SELF_HOST_MODE: 'extended',
      AI_PROVIDER: 'custom-openai-compatible',
      AI_API_KEY: 'secret',
      AI_BASE_URL: 'https://llm.example/v1',
      AI_DEFAULT_MODEL: 'local-default',
      AI_REASONING_MODEL: 'local-reasoning',
    };
    expect(getCoachUpstreamProvider()).toBe('custom-openai-compatible');
    expect(getCoachModel()).toBe('local-default');
    expect(getCoachModel({ thinking: true })).toBe('local-reasoning');
    expect(createCoachClient()).toBeDefined();
    const languageModel = createCoachLanguageModel() as unknown as {
      config: { provider: string };
      modelId: string;
    };
    expect(languageModel.config.provider).toBe('custom-openai-compatible.chat');
    expect(languageModel.modelId).toBe('local-default');
  });

  it('supports an explicit OpenAI provider in self-host mode', () => {
    process.env = {
      ...original,
      SELF_HOST_MODE: 'core-local',
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'secret',
      OPENAI_DEFAULT_MODEL: 'default-model',
      OPENAI_REASONING_MODEL: 'reasoning-model',
    };

    expect(getCoachUpstreamProvider()).toBe('openai');
    expect(getCoachModel()).toBe('default-model');
    expect(getCoachModel({ thinking: true })).toBe('reasoning-model');
    expect(createCoachClient()).toBeDefined();
    const languageModel = createCoachLanguageModel() as unknown as {
      config: { provider: string };
      modelId: string;
    };
    expect(languageModel.config.provider).toBe('openai.responses');
    expect(languageModel.modelId).toBe('default-model');
  });

  it('keeps managed DeepSeek legacy tier model variables compatible', () => {
    process.env = {
      ...original,
      AI_PROVIDER: '',
      AI_COACH_PROVIDER: 'deepseek',
      DEEPSEEK_DEFAULT_MODEL: '',
      DEEPSEEK_REASONING_MODEL: '',
      DEEPSEEK_FLASH_MODEL: 'deepseek-flash',
      DEEPSEEK_PRO_MODEL: 'deepseek-v4-pro',
    };

    expect(getCoachModel()).toBe('deepseek-flash');
    expect(getCoachModel({ thinking: true })).toBe('deepseek-v4-pro');
  });
});
