export const SELF_HOST_AI_PROVIDERS = [
  "none",
  "openai",
  "deepseek",
  "openrouter",
  "dashscope",
  "gemini",
  "xai",
  "ollama",
  "custom-openai-compatible",
] as const;

export type SelfHostAiProvider = (typeof SELF_HOST_AI_PROVIDERS)[number];

export type SelfHostAiModelPreset = {
  id: string;
  label: string;
  contextWindowTokens: number;
  purposes: readonly ("DEFAULT" | "REASONING")[];
};

export type SelfHostAiWebSearchMode =
  | "provider-native-search"
  | "provider-native-search-fetch"
  | "unsupported";

export type SelfHostAiProviderPreset = {
  id: SelfHostAiProvider;
  defaultBaseUrl: string | null;
  apiKeyRequired: boolean;
  defaultModel: string | null;
  reasoningModel: string | null;
  models: readonly SelfHostAiModelPreset[];
  webSearch: SelfHostAiWebSearchMode;
  reasoningControl: "deepseek-thinking" | "reasoning-effort" | "none";
};

const BOTH_PURPOSES = ["DEFAULT", "REASONING"] as const;

/**
 * Curated, versioned defaults for the self-host setup UI.
 *
 * This is intentionally not an exhaustive vendor model directory. Every
 * provider still accepts a custom model ID and explicit context window, so a
 * stale preset never blocks a newly released or privately deployed model.
 */
export const SELF_HOST_AI_PROVIDER_CATALOG: readonly SelfHostAiProviderPreset[] =
  [
    {
      id: "none",
      defaultBaseUrl: null,
      apiKeyRequired: false,
      defaultModel: null,
      reasoningModel: null,
      models: [],
      webSearch: "unsupported",
      reasoningControl: "none",
    },
    {
      id: "openai",
      defaultBaseUrl: "https://api.openai.com/v1",
      apiKeyRequired: true,
      defaultModel: "gpt-6-luna",
      reasoningModel: "gpt-6.1-sol",
      models: [
        {
          id: "gpt-6-luna",
          label: "GPT-6 Luna",
          contextWindowTokens: 1_050_000,
          purposes: BOTH_PURPOSES,
        },
        {
          id: "gpt-6.1-sol",
          label: "GPT-6.1 Sol",
          contextWindowTokens: 1_050_000,
          purposes: BOTH_PURPOSES,
        },
        {
          id: "gpt-6-astra",
          label: "GPT-6 Astra",
          contextWindowTokens: 1_050_000,
          purposes: BOTH_PURPOSES,
        },
        {
          id: "gpt-5.4",
          label: "GPT-5.4",
          contextWindowTokens: 1_050_000,
          purposes: BOTH_PURPOSES,
        },
      ],
      webSearch: "provider-native-search",
      reasoningControl: "reasoning-effort",
    },
    {
      id: "deepseek",
      defaultBaseUrl: "https://api.deepseek.com",
      apiKeyRequired: true,
      defaultModel: "deepseek-flash",
      reasoningModel: "deepseek-v4-pro",
      models: [
        {
          id: "deepseek-flash",
          label: "DeepSeek Flash",
          contextWindowTokens: 1_000_000,
          purposes: BOTH_PURPOSES,
        },
        {
          id: "deepseek-v4-pro",
          label: "DeepSeek V4 Pro",
          contextWindowTokens: 1_000_000,
          purposes: BOTH_PURPOSES,
        },
      ],
      webSearch: "provider-native-search-fetch",
      reasoningControl: "deepseek-thinking",
    },
    {
      id: "openrouter",
      defaultBaseUrl: "https://openrouter.ai/api/v1",
      apiKeyRequired: true,
      defaultModel: "openai/gpt-6-luna",
      reasoningModel: "openai/gpt-6.1-sol",
      models: [
        {
          id: "openai/gpt-6-luna",
          label: "OpenAI · GPT-6 Luna",
          contextWindowTokens: 1_050_000,
          purposes: BOTH_PURPOSES,
        },
        {
          id: "openai/gpt-6.1-sol",
          label: "OpenAI · GPT-6.1 Sol",
          contextWindowTokens: 1_050_000,
          purposes: BOTH_PURPOSES,
        },
        {
          id: "deepseek/deepseek-v4-pro",
          label: "DeepSeek · V4 Pro",
          contextWindowTokens: 1_000_000,
          purposes: BOTH_PURPOSES,
        },
      ],
      webSearch: "provider-native-search",
      reasoningControl: "reasoning-effort",
    },
    {
      id: "dashscope",
      defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKeyRequired: true,
      defaultModel: "qwen3.7-plus",
      reasoningModel: "qwen3.8-max",
      models: [
        {
          id: "qwen3.8-flash",
          label: "Qwen 3.8 Flash",
          contextWindowTokens: 1_000_000,
          purposes: BOTH_PURPOSES,
        },
        {
          id: "qwen3.7-plus",
          label: "Qwen 3.7 Plus",
          contextWindowTokens: 1_000_000,
          purposes: BOTH_PURPOSES,
        },
        {
          id: "qwen3.8-max",
          label: "Qwen 3.8 Max",
          contextWindowTokens: 1_000_000,
          purposes: BOTH_PURPOSES,
        },
      ],
      webSearch: "provider-native-search",
      reasoningControl: "reasoning-effort",
    },
    {
      id: "gemini",
      defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKeyRequired: true,
      defaultModel: "gemini-3.8-flash",
      reasoningModel: "gemini-3.8-flash",
      models: [
        {
          id: "gemini-3.8-flash",
          label: "Gemini 3.8 Flash",
          contextWindowTokens: 1_048_576,
          purposes: BOTH_PURPOSES,
        },
        {
          id: "gemini-3.7-flash",
          label: "Gemini 3.7 Flash",
          contextWindowTokens: 1_048_576,
          purposes: BOTH_PURPOSES,
        },
      ],
      webSearch: "provider-native-search",
      reasoningControl: "reasoning-effort",
    },
    {
      id: "xai",
      defaultBaseUrl: "https://api.x.ai/v1",
      apiKeyRequired: true,
      defaultModel: "grok-4.7",
      reasoningModel: "grok-4.7",
      models: [
        {
          id: "grok-4.7",
          label: "Grok 4.7",
          contextWindowTokens: 500_000,
          purposes: BOTH_PURPOSES,
        },
      ],
      webSearch: "provider-native-search",
      reasoningControl: "reasoning-effort",
    },
    {
      id: "ollama",
      defaultBaseUrl: "http://host.docker.internal:11434/v1",
      apiKeyRequired: false,
      defaultModel: null,
      reasoningModel: null,
      models: [],
      webSearch: "unsupported",
      reasoningControl: "none",
    },
    {
      id: "custom-openai-compatible",
      defaultBaseUrl: null,
      apiKeyRequired: true,
      defaultModel: null,
      reasoningModel: null,
      models: [],
      webSearch: "unsupported",
      reasoningControl: "none",
    },
  ];

export function getSelfHostAiProviderPreset(
  provider: SelfHostAiProvider,
): SelfHostAiProviderPreset {
  return (
    SELF_HOST_AI_PROVIDER_CATALOG.find((entry) => entry.id === provider) ??
    SELF_HOST_AI_PROVIDER_CATALOG[0]
  );
}

export function getSelfHostAiModelPreset(
  provider: SelfHostAiProvider,
  modelId: string | null | undefined,
): SelfHostAiModelPreset | null {
  const normalized = modelId?.trim();
  if (!normalized) return null;
  return (
    getSelfHostAiProviderPreset(provider).models.find(
      (model) => model.id === normalized,
    ) ?? null
  );
}

export function isSelfHostAiProvider(
  value: unknown,
): value is SelfHostAiProvider {
  return SELF_HOST_AI_PROVIDERS.includes(value as SelfHostAiProvider);
}
