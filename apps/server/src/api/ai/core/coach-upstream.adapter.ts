import OpenAI from 'openai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI as createGoogle } from '@ai-sdk/google';
import { createXai } from '@ai-sdk/xai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import {
  getSelfHostAiProviderPreset,
  type SelfHostAiProvider,
} from '@shared/self-host-ai-catalog';

function getSiteUrl() {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://127.0.0.1:3000';
  return raw.replace(/\/+$/, '');
}

export type CoachUpstreamProvider =
  | 'openai'
  | 'openrouter'
  | 'aliyun'
  | 'deepseek'
  | 'gemini'
  | 'xai'
  | 'ollama'
  | 'custom-openai-compatible';
export type CoachClientOptions = { thinking?: boolean };

function normalizeProvider(v: unknown): CoachUpstreamProvider | null {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (s === 'openai') return 'openai';
  if (s === 'openrouter') return 'openrouter';
  if (s === 'aliyun' || s === 'dashscope') return 'aliyun';
  if (s === 'deepseek') return 'deepseek';
  if (s === 'gemini') return 'gemini';
  if (s === 'xai') return 'xai';
  if (s === 'ollama') return 'ollama';
  if (s === 'custom-openai-compatible') return 'custom-openai-compatible';
  return null;
}

function catalogProvider(provider: CoachUpstreamProvider): SelfHostAiProvider {
  return provider === 'aliyun' ? 'dashscope' : provider;
}

function providerPrefix(provider: CoachUpstreamProvider): string {
  if (provider === 'aliyun') return 'DASHSCOPE';
  if (provider === 'custom-openai-compatible') return 'AI';
  return provider.toUpperCase();
}

function providerApiKey(provider: CoachUpstreamProvider): string | undefined {
  const prefix = providerPrefix(provider);
  return process.env[`${prefix}_API_KEY`] || process.env.AI_API_KEY;
}

function providerBaseUrl(provider: CoachUpstreamProvider): string | undefined {
  const prefix = providerPrefix(provider);
  return (
    process.env[`${prefix}_BASE_URL`] ||
    process.env.AI_BASE_URL ||
    getSelfHostAiProviderPreset(catalogProvider(provider)).defaultBaseUrl ||
    undefined
  );
}

function providerModel(
  provider: CoachUpstreamProvider,
  purpose: 'DEFAULT' | 'REASONING',
): string {
  const prefix = providerPrefix(provider);
  const legacyPurpose = purpose === 'DEFAULT' ? 'FLASH' : 'PRO';
  const supportsLegacyTierNames = ['openrouter', 'aliyun', 'deepseek'].includes(
    provider,
  );
  const candidates = [
    process.env[`${prefix}_${purpose}_MODEL`],
    supportsLegacyTierNames
      ? process.env[`${prefix}_${legacyPurpose}_MODEL`]
      : undefined,
    process.env[`AI_${purpose}_MODEL`],
  ];
  return (
    candidates
      .map((candidate) => String(candidate ?? '').trim())
      .find(Boolean) ?? ''
  );
}

/**
 * 选择 AI Coach 上游提供商。
 *
 * 优先级：
 * - AI_PROVIDER / AI_COACH_PROVIDER 显式指定
 * - 否则按“哪个 key 配了”自动推断（保持对旧配置的兼容）
 */
export function getCoachUpstreamProvider(): CoachUpstreamProvider | null {
  const selfHostProvider = String(process.env.AI_PROVIDER ?? '')
    .trim()
    .toLowerCase();
  if (selfHostProvider === 'none') return null;
  const explicit = normalizeProvider(
    selfHostProvider || process.env.AI_COACH_PROVIDER,
  );
  if (explicit) return explicit;

  // Self-host never guesses a provider from stale cloud credentials.
  if (process.env.SELF_HOST_MODE?.trim()) return null;

  if (process.env.OPENAI_API_KEY?.trim()) return 'openai';
  if (process.env.OPENROUTER_API_KEY?.trim()) return 'openrouter';
  if (process.env.DASHSCOPE_API_KEY?.trim()) return 'aliyun';
  if (process.env.DEEPSEEK_API_KEY?.trim()) return 'deepseek';
  return null;
}

export function isCoachUpstreamConfigured(): boolean {
  return getCoachUpstreamProvider() !== null;
}

export function getCoachBaseUrlForLog(
  provider: CoachUpstreamProvider | null,
): string {
  if (provider === 'openrouter') {
    return process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
  }
  if (provider === 'openai') {
    return process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  }
  if (provider === 'aliyun') return process.env.DASHSCOPE_BASE_URL ?? 'none';
  if (provider === 'deepseek') return process.env.DEEPSEEK_BASE_URL ?? 'none';
  if (provider === 'custom-openai-compatible') {
    return process.env.AI_BASE_URL ?? 'none';
  }
  if (provider) return providerBaseUrl(provider) ?? 'none';
  return 'none';
}

export function getCoachModel(options?: CoachClientOptions): string {
  // 用户只选择默认/推理用途；这里映射到当前实际模型 ID。
  const provider = getCoachUpstreamProvider();
  if (!provider) return '';
  return providerModel(provider, options?.thinking ? 'REASONING' : 'DEFAULT');
}

export function createCoachClient(_options?: CoachClientOptions): OpenAI {
  // 所有上游都通过 OpenAI SDK 的 compatible client 接入，上层无需关心 baseURL/header 差异。
  const provider = getCoachUpstreamProvider();
  if (provider === 'openai') {
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    });
  }
  if (provider === 'openrouter') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const baseURL =
      process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
    const siteUrl = getSiteUrl();
    const title = process.env.OPENROUTER_APP_TITLE ?? 'Trainingload.ai';
    return new OpenAI({
      apiKey,
      baseURL,
      defaultHeaders: {
        'HTTP-Referer': siteUrl,
        'X-Title': title,
      },
    });
  }

  if (provider === 'aliyun') {
    return new OpenAI({
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseURL:
        process.env.DASHSCOPE_BASE_URL ??
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
  }

  if (provider === 'deepseek') {
    return new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    });
  }

  if (provider === 'custom-openai-compatible') {
    return new OpenAI({
      apiKey: process.env.AI_API_KEY || 'not-required',
      baseURL: process.env.AI_BASE_URL,
    });
  }

  if (provider) {
    return new OpenAI({
      apiKey: providerApiKey(provider) || 'not-required',
      baseURL: providerBaseUrl(provider),
    });
  }

  throw new Error('SELF_HOST_AI_NOT_CONFIGURED');
}

function getReasoningEffort(): 'low' | 'medium' | 'high' | undefined {
  const raw = String(process.env.AI_COACH_REASONING_EFFORT ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
  return undefined;
}

export function buildThinkingRequestExtras(args: {
  thinking: boolean;
  provider: CoachUpstreamProvider | null;
}) {
  const catalog = args.provider
    ? getSelfHostAiProviderPreset(catalogProvider(args.provider))
    : null;
  if (!args.thinking) {
    if (catalog?.reasoningControl === 'deepseek-thinking') {
      return {
        thinking: { type: 'disabled' },
      };
    }
    return {};
  }
  if (catalog?.reasoningControl === 'deepseek-thinking') {
    return {
      thinking: { type: 'enabled' },
      reasoning_effort: getReasoningEffort() ?? 'high',
    };
  }
  if (catalog?.reasoningControl === 'reasoning-effort') {
    return { reasoning_effort: getReasoningEffort() ?? 'high' };
  }
  return {};
}

export function buildCoachStreamProviderOptions(args: {
  thinking: boolean;
  provider: CoachUpstreamProvider | null;
}) {
  const reasoningEffort = getReasoningEffort() ?? 'high';
  if (args.provider === 'gemini') {
    return args.thinking
      ? { google: { thinkingConfig: { thinkingLevel: reasoningEffort } } }
      : undefined;
  }
  if (args.provider === 'xai') {
    return {
      xai: { reasoningEffort: args.thinking ? reasoningEffort : 'none' },
    };
  }

  const requestExtras = buildThinkingRequestExtras(args) as Record<
    string,
    unknown
  >;
  if (Object.keys(requestExtras).length === 0) return undefined;

  // Both the Node OpenAI SDK and @ai-sdk/openai-compatible pass unknown
  // properties through to the request body. Keep DeepSeek's `thinking`
  // extension at the top level; `extra_body` is a Python SDK option and would
  // otherwise be sent literally and ignored by DeepSeek.
  const { reasoning_effort: compatibleReasoningEffort } = requestExtras;
  const passthrough = Object.fromEntries(
    Object.entries(requestExtras).filter(([key]) => key !== 'reasoning_effort'),
  );
  const aiSdkExtras = {
    ...passthrough,
    ...(typeof compatibleReasoningEffort === 'string'
      ? { reasoningEffort: compatibleReasoningEffort }
      : {}),
  };
  const provider = args.provider ?? 'openrouter';
  return {
    [provider]: aiSdkExtras,
  };
}

export function createCoachLanguageModel(
  options?: CoachClientOptions,
  modelOverride?: string,
): LanguageModel {
  const provider = getCoachUpstreamProvider();
  const model = modelOverride ?? getCoachModel(options);
  if (!provider || !model.trim()) {
    throw new Error('AI Coach upstream provider/model is not configured');
  }

  if (provider === 'openrouter') {
    const siteUrl = getSiteUrl();
    const title = process.env.OPENROUTER_APP_TITLE ?? 'Trainingload.ai';
    const openrouter = createOpenAICompatible({
      name: 'openrouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL:
        process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
      headers: {
        'HTTP-Referer': siteUrl,
        'X-Title': title,
      },
      includeUsage: true,
    });
    return openrouter(model);
  }

  if (provider === 'openai') {
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    });
    return openai.responses(model);
  }

  if (provider === 'aliyun') {
    const aliyun = createOpenAICompatible({
      name: 'aliyun',
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseURL:
        process.env.DASHSCOPE_BASE_URL ??
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
      includeUsage: true,
    });
    return aliyun(model);
  }

  if (provider === 'custom-openai-compatible') {
    const custom = createOpenAICompatible({
      name: 'custom-openai-compatible',
      apiKey: process.env.AI_API_KEY || 'not-required',
      baseURL: process.env.AI_BASE_URL,
      includeUsage: true,
    });
    return custom(model);
  }

  if (provider === 'gemini') {
    const configuredBaseUrl = providerBaseUrl(provider);
    const google = createGoogle({
      apiKey: providerApiKey(provider),
      // The setup screen historically stored Google's OpenAI-compatible
      // suffix. The native SDK targets the parent Gemini endpoint instead.
      baseURL: configuredBaseUrl?.replace(/\/openai\/?$/, ''),
    });
    return google(model);
  }

  if (provider === 'xai') {
    const xai = createXai({
      apiKey: providerApiKey(provider),
      baseURL: providerBaseUrl(provider),
    });
    return xai.responses(model);
  }

  if (provider !== 'deepseek') {
    const compatible = createOpenAICompatible({
      name: provider,
      apiKey: providerApiKey(provider) || 'not-required',
      baseURL: providerBaseUrl(provider),
      includeUsage: true,
    });
    return compatible(model);
  }

  const deepseek = createOpenAICompatible({
    name: 'deepseek',
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    includeUsage: true,
  });
  return deepseek(model);
}

/**
 * Per-attempt request options for background review model calls (digest,
 * plan review judgment, adjustment composition). The SDK default is a 10 min
 * timeout per attempt; review calls must fail fast and fall back instead.
 */
export function coachReviewRequestOptions(signal?: AbortSignal) {
  const configured = Number(process.env.COACH_REVIEW_UPSTREAM_TIMEOUT_MS);
  const timeout =
    Number.isFinite(configured) && configured > 0
      ? Math.min(120_000, Math.max(5_000, configured))
      : 35_000;
  return {
    ...(signal ? { signal } : {}),
    timeout,
    // OpenAI SDK only retries connection errors, 408/409/429 and 5xx.
    // Authentication, billing, and forbidden responses therefore fall through
    // to the conservative fallback immediately.
    maxRetries: 2,
  };
}
