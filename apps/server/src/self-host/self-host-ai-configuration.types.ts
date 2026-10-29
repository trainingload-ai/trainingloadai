import {
  SELF_HOST_AI_PROVIDERS,
  SELF_HOST_AI_PROVIDER_CATALOG,
  type SelfHostAiProvider,
} from '@shared/self-host-ai-catalog';

export { SELF_HOST_AI_PROVIDERS, type SelfHostAiProvider };

export type SelfHostAiConfigurationView = {
  source: 'environment' | 'owner';
  provider: SelfHostAiProvider;
  baseUrl: string | null;
  defaultModel: string | null;
  defaultModelContextTokens: number | null;
  reasoningModel: string | null;
  reasoningModelContextTokens: number | null;
  webSearchEnabled: boolean;
  apiKeyConfigured: boolean;
  updatedAt: string | null;
};

export const SELF_HOST_AI_DEFAULT_BASE_URLS = Object.fromEntries(
  SELF_HOST_AI_PROVIDER_CATALOG.filter(
    (provider) => provider.defaultBaseUrl !== null,
  ).map((provider) => [provider.id, provider.defaultBaseUrl]),
) as Partial<Record<SelfHostAiProvider, string>>;
