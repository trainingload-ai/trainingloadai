import { describe, expect, it } from '@jest/globals';
import { lookupAiModel, resolveAiModel } from '../ai-model-catalog';

function withEnvironment<T>(
  values: Record<string, string | undefined>,
  run: () => T,
): T {
  const previous = new Map(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('AI model catalog self-host provider selection', () => {
  it('resolves custom OpenAI-compatible default and reasoning models', () => {
    withEnvironment(
      {
        SELF_HOST_MODE: 'extended',
        AI_PROVIDER: 'custom-openai-compatible',
        AI_DEFAULT_MODEL: 'local-default',
        AI_REASONING_MODEL: 'local-reasoning',
        AI_COACH_PROVIDER: undefined,
        DEEPSEEK_API_KEY: 'stale-managed-key',
      },
      () => {
        expect(resolveAiModel('DEFAULT')).toEqual(
          expect.objectContaining({
            provider: 'custom-openai-compatible',
            modelId: 'local-default',
            purpose: 'DEFAULT',
          }),
        );
        expect(resolveAiModel('REASONING')).toEqual(
          expect.objectContaining({
            provider: 'custom-openai-compatible',
            modelId: 'local-reasoning',
            purpose: 'REASONING',
          }),
        );
        expect(
          lookupAiModel({
            provider: 'custom-openai-compatible',
            modelId: 'local-default',
          }),
        ).not.toBeNull();
      },
    );
  });

  it('does not infer a provider from stale managed credentials in self-host mode', () => {
    withEnvironment(
      {
        SELF_HOST_MODE: 'extended',
        AI_PROVIDER: undefined,
        AI_COACH_PROVIDER: undefined,
        DEEPSEEK_API_KEY: 'stale-managed-key',
        DEEPSEEK_DEFAULT_MODEL: 'deepseek-chat',
      },
      () => {
        expect(() => resolveAiModel('DEFAULT')).toThrow(
          'AI_MODEL_PURPOSE_UNAVAILABLE',
        );
      },
    );
  });

  it('keeps managed DeepSeek tier model variables compatible', () => {
    withEnvironment(
      {
        SELF_HOST_MODE: undefined,
        AI_PROVIDER: undefined,
        AI_COACH_PROVIDER: 'deepseek',
        DEEPSEEK_API_KEY: 'secret',
        DEEPSEEK_DEFAULT_MODEL: undefined,
        DEEPSEEK_REASONING_MODEL: undefined,
        DEEPSEEK_FLASH_MODEL: 'deepseek-flash',
        DEEPSEEK_PRO_MODEL: 'deepseek-v4-pro',
      },
      () => {
        expect(resolveAiModel('DEFAULT')).toMatchObject({
          provider: 'deepseek',
          modelId: 'deepseek-flash',
          purpose: 'DEFAULT',
        });
        expect(resolveAiModel('REASONING')).toMatchObject({
          provider: 'deepseek',
          modelId: 'deepseek-v4-pro',
          purpose: 'REASONING',
        });
      },
    );
  });
});
