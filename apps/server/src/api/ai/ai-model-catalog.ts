import type { AiModelPurpose } from '@shared/ai-model';

export type AiProvider =
  | 'openai'
  | 'openrouter'
  | 'aliyun'
  | 'deepseek'
  | 'gemini'
  | 'xai'
  | 'ollama'
  | 'custom-openai-compatible';

export type ResolvedAiModel = {
  provider: AiProvider;
  modelId: string;
  purpose: AiModelPurpose;
  enabled: boolean;
};

const PROVIDERS: AiProvider[] = [
  'openai',
  'deepseek',
  'openrouter',
  'aliyun',
  'gemini',
  'xai',
  'ollama',
  'custom-openai-compatible',
];

export function normalizeAiModelPurpose(value: unknown): AiModelPurpose {
  return String(value ?? '')
    .trim()
    .toUpperCase() === 'REASONING'
    ? 'REASONING'
    : 'DEFAULT';
}

function providerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AiProvider | null {
  const selfHostProvider = String(env.AI_PROVIDER ?? '')
    .trim()
    .toLowerCase();
  if (selfHostProvider === 'none') return null;
  const configured = String(selfHostProvider || env.AI_COACH_PROVIDER || '')
    .trim()
    .toLowerCase();
  if (configured === 'deepseek') return 'deepseek';
  if (configured === 'openai') return 'openai';
  if (configured === 'openrouter') return 'openrouter';
  if (configured === 'aliyun' || configured === 'dashscope') return 'aliyun';
  if (configured === 'gemini') return 'gemini';
  if (configured === 'xai') return 'xai';
  if (configured === 'ollama') return 'ollama';
  if (configured === 'custom-openai-compatible') {
    return 'custom-openai-compatible';
  }
  if (env.SELF_HOST_MODE?.trim()) return null;
  if (env.OPENAI_API_KEY?.trim()) return 'openai';
  if (env.DEEPSEEK_API_KEY?.trim()) return 'deepseek';
  if (env.OPENROUTER_API_KEY?.trim()) return 'openrouter';
  if (env.DASHSCOPE_API_KEY?.trim()) return 'aliyun';
  return null;
}

function envPrefix(provider: AiProvider) {
  if (provider === 'custom-openai-compatible') return 'AI';
  return provider === 'aliyun' ? 'DASHSCOPE' : provider.toUpperCase();
}

function modelEnvValue(
  env: NodeJS.ProcessEnv,
  provider: AiProvider,
  suffix: string,
): string {
  const legacySuffix =
    suffix === 'DEFAULT_MODEL'
      ? 'FLASH_MODEL'
      : suffix === 'REASONING_MODEL'
        ? 'PRO_MODEL'
        : null;
  const legacyValue =
    legacySuffix && ['openrouter', 'aliyun', 'deepseek'].includes(provider)
      ? env[`${envPrefix(provider)}_${legacySuffix}`]
      : undefined;
  return String(
    env[`${envPrefix(provider)}_${suffix}`] ??
      legacyValue ??
      env[`AI_${suffix}`] ??
      '',
  ).trim();
}

function splitModels(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

function configuredEntries(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedAiModel[] {
  const entries: ResolvedAiModel[] = [];

  for (const provider of PROVIDERS) {
    const prefix = envPrefix(provider);
    for (const purpose of ['DEFAULT', 'REASONING'] as const) {
      const primary = modelEnvValue(env, provider, `${purpose}_MODEL`);
      const fallbacks = splitModels(
        env[`${prefix}_${purpose}_FALLBACK_MODELS`] ??
          env[`AI_${purpose}_FALLBACK_MODELS`],
      );
      for (const modelId of [primary, ...fallbacks].filter(Boolean)) {
        entries.push({ provider, modelId, purpose, enabled: true });
      }
    }
  }

  const rawJson = String(env.AI_MODEL_CATALOG_JSON ?? '').trim();
  if (rawJson) {
    const parsed = JSON.parse(rawJson) as Array<Partial<ResolvedAiModel>>;
    if (!Array.isArray(parsed)) {
      throw new Error('AI_MODEL_CATALOG_JSON must be an array');
    }
    for (const item of parsed) {
      const provider = String(item.provider ?? '').toLowerCase() as AiProvider;
      const modelId = String(item.modelId ?? '').trim();
      const purpose = normalizeAiModelPurpose(item.purpose);
      if (!PROVIDERS.includes(provider) || !modelId) {
        throw new Error('AI_MODEL_CATALOG_JSON contains an invalid entry');
      }
      entries.push({
        provider,
        modelId,
        purpose,
        enabled: item.enabled !== false,
      });
    }
  }

  const byKey = new Map<string, ResolvedAiModel>();
  for (const entry of entries) {
    const key = `${entry.provider}:${entry.modelId}`;
    const existing = byKey.get(key);
    if (existing && existing.purpose !== entry.purpose) {
      throw new Error(`AI model catalog conflict for ${key}`);
    }
    byKey.set(key, entry);
  }
  return [...byKey.values()];
}

export function validateAiModelCatalog(env: NodeJS.ProcessEnv = process.env) {
  configuredEntries(env);
}

export function lookupAiModel(args: {
  provider?: string | null;
  modelId: string;
}): ResolvedAiModel | null {
  const provider = String(args.provider ?? '')
    .trim()
    .toLowerCase() as AiProvider;
  const modelId = args.modelId.trim();
  if (!PROVIDERS.includes(provider) || !modelId) return null;
  return (
    configuredEntries().find(
      (entry) => entry.provider === provider && entry.modelId === modelId,
    ) ?? null
  );
}

export function resolveAiModel(purposeInput: unknown): ResolvedAiModel {
  const purpose = normalizeAiModelPurpose(purposeInput);
  const provider = providerFromEnv();
  if (!provider) throw new Error('AI_MODEL_PURPOSE_UNAVAILABLE');
  const modelId = modelEnvValue(process.env, provider, `${purpose}_MODEL`);
  const resolved = modelId ? lookupAiModel({ provider, modelId }) : null;
  if (!resolved || !resolved.enabled || resolved.purpose !== purpose) {
    throw new Error('AI_MODEL_PURPOSE_UNAVAILABLE');
  }
  return resolved;
}

export function purposeForActualModel(args: {
  provider?: string | null;
  modelId: string;
  requestedPurpose?: AiModelPurpose;
}): AiModelPurpose | null {
  return lookupAiModel(args)?.purpose ?? null;
}
