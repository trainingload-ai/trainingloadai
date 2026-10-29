import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  decryptSelfHostAiApiKey,
  encryptSelfHostAiApiKey,
} from './self-host-ai-configuration.crypto';
import {
  SELF_HOST_AI_DEFAULT_BASE_URLS,
  SELF_HOST_AI_PROVIDERS,
  type SelfHostAiConfigurationView,
  type SelfHostAiProvider,
} from './self-host-ai-configuration.types';
import {
  getSelfHostAiModelPreset,
  getSelfHostAiProviderPreset,
} from '@shared/self-host-ai-catalog';
import type { UpdateSelfHostAiConfigurationDto } from './dto/update-self-host-ai-configuration.dto';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';

const AI_RUNTIME_KEYS = [
  'AI_API_KEY',
  'AI_BASE_URL',
  'AI_DEFAULT_MODEL',
  'AI_DEFAULT_MODEL_CONTEXT_TOKENS',
  'AI_REASONING_MODEL',
  'AI_REASONING_MODEL_CONTEXT_TOKENS',
  'AI_WEB_SEARCH_ENABLED',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_DEFAULT_MODEL',
  'OPENAI_REASONING_MODEL',
  'OPENROUTER_API_KEY',
  'OPENROUTER_BASE_URL',
  'OPENROUTER_DEFAULT_MODEL',
  'OPENROUTER_REASONING_MODEL',
  'DASHSCOPE_API_KEY',
  'DASHSCOPE_BASE_URL',
  'DASHSCOPE_DEFAULT_MODEL',
  'DASHSCOPE_REASONING_MODEL',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'DEEPSEEK_DEFAULT_MODEL',
  'DEEPSEEK_REASONING_MODEL',
  'GEMINI_API_KEY',
  'GEMINI_BASE_URL',
  'GEMINI_DEFAULT_MODEL',
  'GEMINI_DEFAULT_MODEL_CONTEXT_TOKENS',
  'GEMINI_REASONING_MODEL',
  'GEMINI_REASONING_MODEL_CONTEXT_TOKENS',
  'XAI_API_KEY',
  'XAI_BASE_URL',
  'XAI_DEFAULT_MODEL',
  'XAI_DEFAULT_MODEL_CONTEXT_TOKENS',
  'XAI_REASONING_MODEL',
  'XAI_REASONING_MODEL_CONTEXT_TOKENS',
  'GROQ_API_KEY',
  'GROQ_BASE_URL',
  'GROQ_DEFAULT_MODEL',
  'GROQ_DEFAULT_MODEL_CONTEXT_TOKENS',
  'GROQ_REASONING_MODEL',
  'GROQ_REASONING_MODEL_CONTEXT_TOKENS',
  'MISTRAL_API_KEY',
  'MISTRAL_BASE_URL',
  'MISTRAL_DEFAULT_MODEL',
  'MISTRAL_DEFAULT_MODEL_CONTEXT_TOKENS',
  'MISTRAL_REASONING_MODEL',
  'MISTRAL_REASONING_MODEL_CONTEXT_TOKENS',
  'OLLAMA_API_KEY',
  'OLLAMA_BASE_URL',
  'OLLAMA_DEFAULT_MODEL',
  'OLLAMA_DEFAULT_MODEL_CONTEXT_TOKENS',
  'OLLAMA_REASONING_MODEL',
  'OLLAMA_REASONING_MODEL_CONTEXT_TOKENS',
] as const;

type StoredConfiguration = {
  aiProvider: string | null;
  aiBaseUrl: string | null;
  aiDefaultModel: string | null;
  aiDefaultModelContextTokens: number | null;
  aiReasoningModel: string | null;
  aiReasoningModelContextTokens: number | null;
  aiWebSearchEnabled: boolean;
  aiApiKeyEncrypted: string | null;
  aiConfigUpdatedAt: Date | null;
};

function normalizedProvider(value: unknown): SelfHostAiProvider {
  const provider = String(value ?? '')
    .trim()
    .toLowerCase();
  if (provider === 'aliyun') return 'dashscope';
  return SELF_HOST_AI_PROVIDERS.includes(provider as SelfHostAiProvider)
    ? (provider as SelfHostAiProvider)
    : 'none';
}

function providerEnvPrefix(provider: SelfHostAiProvider): string {
  if (provider === 'dashscope') return 'DASHSCOPE';
  if (provider === 'custom-openai-compatible') return 'AI';
  return provider.toUpperCase();
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 16_000 && parsed <= 4_000_000
    ? parsed
    : null;
}

function booleanSetting(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  );
}

function configuredEnvironmentKey(provider: SelfHostAiProvider) {
  const preset = getSelfHostAiProviderPreset(provider);
  if (!preset.apiKeyRequired) return 'not-required';
  const prefix = providerEnvPrefix(provider);
  return process.env[`${prefix}_API_KEY`] || process.env.AI_API_KEY;
}

function environmentModels(provider: SelfHostAiProvider) {
  const prefix = providerEnvPrefix(provider);
  const defaultModel =
    process.env[`${prefix}_DEFAULT_MODEL`]?.trim() ||
    process.env.AI_DEFAULT_MODEL?.trim() ||
    null;
  const reasoningModel =
    process.env[`${prefix}_REASONING_MODEL`]?.trim() ||
    process.env.AI_REASONING_MODEL?.trim() ||
    null;
  return {
    defaultModel,
    defaultModelContextTokens:
      positiveInteger(
        process.env[`${prefix}_DEFAULT_MODEL_CONTEXT_TOKENS`] ??
          process.env.AI_DEFAULT_MODEL_CONTEXT_TOKENS,
      ) ??
      getSelfHostAiModelPreset(provider, defaultModel)?.contextWindowTokens ??
      null,
    reasoningModel,
    reasoningModelContextTokens:
      positiveInteger(
        process.env[`${prefix}_REASONING_MODEL_CONTEXT_TOKENS`] ??
          process.env.AI_REASONING_MODEL_CONTEXT_TOKENS,
      ) ??
      getSelfHostAiModelPreset(provider, reasoningModel)?.contextWindowTokens ??
      null,
  };
}

@Injectable()
export class SelfHostAiConfigurationService implements OnModuleInit {
  private readonly logger = new Logger(SelfHostAiConfigurationService.name);
  private initialization: Promise<void> | null = null;
  private credentialUnavailable = false;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
  ) {}

  onModuleInit() {
    return this.initializeRuntime();
  }

  initializeRuntime(): Promise<void> {
    if (!process.env.SELF_HOST_MODE?.trim()) return Promise.resolve();
    this.initialization ??= this.loadOwnerOverride();
    return this.initialization;
  }

  private authSecret() {
    const secret =
      process.env.SELF_HOST_AUTH_SECRET?.trim() ||
      process.env.BETTER_AUTH_SECRET?.trim() ||
      '';
    if (secret.length < 32) {
      throw new Error(
        'SELF_HOST_AI_CONFIG_ENCRYPTION_UNAVAILABLE: SELF_HOST_AUTH_SECRET is missing or too short',
      );
    }
    return secret;
  }

  private async loadOwnerOverride() {
    const stored = await this.prisma.selfHostInstance.findUnique({
      where: { id: 1 },
      select: {
        aiProvider: true,
        aiBaseUrl: true,
        aiDefaultModel: true,
        aiDefaultModelContextTokens: true,
        aiReasoningModel: true,
        aiReasoningModelContextTokens: true,
        aiWebSearchEnabled: true,
        aiApiKeyEncrypted: true,
        aiConfigUpdatedAt: true,
      },
    });
    if (!stored?.aiProvider) return;
    try {
      this.applyStoredConfiguration(stored);
    } catch {
      this.credentialUnavailable = true;
      this.clearRuntimeCredentials();
      process.env.AI_PROVIDER = 'none';
      this.logger.error(
        '[self-host] owner-managed AI credential cannot be decrypted; AI remains disabled until the owner replaces the key',
      );
      return;
    }
    this.logger.log(
      `[self-host] applied owner-managed AI provider ${normalizedProvider(stored.aiProvider)}`,
    );
  }

  private clearRuntimeCredentials() {
    for (const key of AI_RUNTIME_KEYS) delete process.env[key];
  }

  private applyStoredConfiguration(stored: StoredConfiguration) {
    const provider = normalizedProvider(stored.aiProvider);
    this.clearRuntimeCredentials();
    process.env.AI_PROVIDER = provider;
    if (provider === 'none') return;

    const preset = getSelfHostAiProviderPreset(provider);
    if (preset.apiKeyRequired && !stored.aiApiKeyEncrypted) {
      throw new Error('SELF_HOST_AI_CONFIG_CREDENTIAL_MISSING');
    }
    const apiKey = stored.aiApiKeyEncrypted
      ? decryptSelfHostAiApiKey(stored.aiApiKeyEncrypted, this.authSecret())
      : '';
    const baseUrl =
      stored.aiBaseUrl || SELF_HOST_AI_DEFAULT_BASE_URLS[provider] || '';
    const prefix = providerEnvPrefix(provider);
    if (apiKey) {
      process.env[`${prefix}_API_KEY`] = apiKey;
      process.env.AI_API_KEY = apiKey;
    }
    if (baseUrl) {
      process.env[`${prefix}_BASE_URL`] = baseUrl;
      process.env.AI_BASE_URL = baseUrl;
    }
    const defaultModel = stored.aiDefaultModel || '';
    const reasoningModel = stored.aiReasoningModel || '';
    const defaultContext = stored.aiDefaultModelContextTokens
      ? String(stored.aiDefaultModelContextTokens)
      : '';
    const reasoningContext = stored.aiReasoningModelContextTokens
      ? String(stored.aiReasoningModelContextTokens)
      : '';
    process.env[`${prefix}_DEFAULT_MODEL`] = defaultModel;
    process.env[`${prefix}_REASONING_MODEL`] = reasoningModel;
    process.env[`${prefix}_DEFAULT_MODEL_CONTEXT_TOKENS`] = defaultContext;
    process.env[`${prefix}_REASONING_MODEL_CONTEXT_TOKENS`] = reasoningContext;
    process.env.AI_DEFAULT_MODEL = defaultModel;
    process.env.AI_REASONING_MODEL = reasoningModel;
    process.env.AI_DEFAULT_MODEL_CONTEXT_TOKENS = defaultContext;
    process.env.AI_REASONING_MODEL_CONTEXT_TOKENS = reasoningContext;
    process.env.AI_WEB_SEARCH_ENABLED = stored.aiWebSearchEnabled
      ? 'true'
      : 'false';
  }

  private environmentView(): SelfHostAiConfigurationView {
    const provider = normalizedProvider(process.env.AI_PROVIDER);
    const models = environmentModels(provider);
    const prefix = providerEnvPrefix(provider);
    const preset = getSelfHostAiProviderPreset(provider);
    return {
      source: 'environment',
      provider,
      baseUrl:
        process.env[`${prefix}_BASE_URL`]?.trim() ||
        process.env.AI_BASE_URL?.trim() ||
        SELF_HOST_AI_DEFAULT_BASE_URLS[provider] ||
        null,
      ...models,
      webSearchEnabled:
        preset.webSearch !== 'unsupported' &&
        booleanSetting(process.env.AI_WEB_SEARCH_ENABLED),
      apiKeyConfigured:
        provider !== 'none' &&
        Boolean(configuredEnvironmentKey(provider)?.trim()),
      updatedAt: null,
    };
  }

  async getConfiguration(): Promise<SelfHostAiConfigurationView> {
    await this.initializeRuntime();
    const stored = await this.prisma.selfHostInstance.findUnique({
      where: { id: 1 },
      select: {
        aiProvider: true,
        aiBaseUrl: true,
        aiDefaultModel: true,
        aiDefaultModelContextTokens: true,
        aiReasoningModel: true,
        aiReasoningModelContextTokens: true,
        aiWebSearchEnabled: true,
        aiApiKeyEncrypted: true,
        aiConfigUpdatedAt: true,
      },
    });
    if (!stored) throw new NotFoundException('Self-host instance is missing');
    if (!stored.aiProvider) return this.environmentView();
    const provider = normalizedProvider(stored.aiProvider);
    const preset = getSelfHostAiProviderPreset(provider);
    return {
      source: 'owner',
      provider,
      baseUrl:
        stored.aiBaseUrl || SELF_HOST_AI_DEFAULT_BASE_URLS[provider] || null,
      defaultModel: stored.aiDefaultModel,
      defaultModelContextTokens: stored.aiDefaultModelContextTokens,
      reasoningModel: stored.aiReasoningModel,
      reasoningModelContextTokens: stored.aiReasoningModelContextTokens,
      webSearchEnabled:
        preset.webSearch !== 'unsupported' && stored.aiWebSearchEnabled,
      apiKeyConfigured:
        provider !== 'none' &&
        (!preset.apiKeyRequired ||
          (Boolean(stored.aiApiKeyEncrypted) && !this.credentialUnavailable)),
      updatedAt: stored.aiConfigUpdatedAt?.toISOString() || null,
    };
  }

  private normalizeBaseUrl(provider: SelfHostAiProvider, value?: string) {
    const baseUrl = value?.trim() || SELF_HOST_AI_DEFAULT_BASE_URLS[provider];
    if (!baseUrl) {
      throw new BadRequestException(
        'Base URL is required for a custom OpenAI-compatible provider',
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new BadRequestException('Base URL must be a valid HTTP(S) URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Base URL must use HTTP or HTTPS');
    }
    if (parsed.username || parsed.password) {
      throw new BadRequestException(
        'Base URL must not contain embedded credentials',
      );
    }
    return baseUrl.replace(/\/+$/, '');
  }

  async updateConfiguration(
    input: UpdateSelfHostAiConfigurationDto,
  ): Promise<SelfHostAiConfigurationView> {
    await this.initializeRuntime();
    const provider = normalizedProvider(input.provider);
    if (provider !== input.provider) {
      throw new BadRequestException('Unsupported AI provider');
    }
    const current = await this.prisma.selfHostInstance.findUnique({
      where: { id: 1 },
      select: { aiProvider: true, aiApiKeyEncrypted: true },
    });
    if (!current) throw new NotFoundException('Self-host instance is missing');

    if (provider === 'none') {
      const stored = await this.prisma.selfHostInstance.update({
        where: { id: 1 },
        data: {
          aiProvider: 'none',
          aiBaseUrl: null,
          aiDefaultModel: null,
          aiDefaultModelContextTokens: null,
          aiReasoningModel: null,
          aiReasoningModelContextTokens: null,
          aiWebSearchEnabled: false,
          aiApiKeyEncrypted: null,
          aiConfigUpdatedAt: new Date(),
        },
        select: {
          aiProvider: true,
          aiBaseUrl: true,
          aiDefaultModel: true,
          aiDefaultModelContextTokens: true,
          aiReasoningModel: true,
          aiReasoningModelContextTokens: true,
          aiWebSearchEnabled: true,
          aiApiKeyEncrypted: true,
          aiConfigUpdatedAt: true,
        },
      });
      this.credentialUnavailable = false;
      this.applyStoredConfiguration(stored);
      this.capabilities?.notifyChanged();
      return this.getConfiguration();
    }

    const defaultModel = input.defaultModel?.trim() || '';
    const reasoningModel = input.reasoningModel?.trim() || '';
    if (!defaultModel || !reasoningModel) {
      throw new BadRequestException('Both AI model fields are required');
    }
    const defaultModelContextTokens = this.resolveContextWindow({
      provider,
      model: defaultModel,
      input: input.defaultModelContextTokens,
    });
    const reasoningModelContextTokens = this.resolveContextWindow({
      provider,
      model: reasoningModel,
      input: input.reasoningModelContextTokens,
    });
    const preset = getSelfHostAiProviderPreset(provider);
    const webSearchEnabled = input.webSearchEnabled === true;
    if (webSearchEnabled && preset.webSearch === 'unsupported') {
      throw new BadRequestException(
        'Web search is not supported for the selected AI provider',
      );
    }
    const canReuseCredential =
      normalizedProvider(current.aiProvider) === provider &&
      Boolean(current.aiApiKeyEncrypted) &&
      !this.credentialUnavailable;
    const apiKey = input.apiKey?.trim() || '';
    if (preset.apiKeyRequired && !apiKey && !canReuseCredential) {
      throw new BadRequestException(
        'API key is required when configuring this provider',
      );
    }
    const stored = await this.prisma.selfHostInstance.update({
      where: { id: 1 },
      data: {
        aiProvider: provider,
        aiBaseUrl: this.normalizeBaseUrl(provider, input.baseUrl),
        aiDefaultModel: defaultModel,
        aiDefaultModelContextTokens: defaultModelContextTokens,
        aiReasoningModel: reasoningModel,
        aiReasoningModelContextTokens: reasoningModelContextTokens,
        aiWebSearchEnabled: webSearchEnabled,
        aiApiKeyEncrypted: apiKey
          ? encryptSelfHostAiApiKey(apiKey, this.authSecret())
          : current.aiApiKeyEncrypted,
        aiConfigUpdatedAt: new Date(),
      },
      select: {
        aiProvider: true,
        aiBaseUrl: true,
        aiDefaultModel: true,
        aiDefaultModelContextTokens: true,
        aiReasoningModel: true,
        aiReasoningModelContextTokens: true,
        aiWebSearchEnabled: true,
        aiApiKeyEncrypted: true,
        aiConfigUpdatedAt: true,
      },
    });
    this.credentialUnavailable = false;
    this.applyStoredConfiguration(stored);
    this.capabilities?.notifyChanged();
    return this.getConfiguration();
  }

  private resolveContextWindow(args: {
    provider: SelfHostAiProvider;
    model: string;
    input?: number;
  }): number {
    const preset = getSelfHostAiModelPreset(args.provider, args.model);
    if (preset) return preset.contextWindowTokens;
    const configured = positiveInteger(args.input);
    if (!configured) {
      throw new BadRequestException(
        'Context window is required for a custom AI model',
      );
    }
    return configured;
  }
}
