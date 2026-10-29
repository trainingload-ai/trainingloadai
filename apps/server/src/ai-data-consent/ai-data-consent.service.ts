import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { $Enums, type Prisma } from '@prisma/client';
import { UserQueryService } from '@/api/user/user-query.service';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import {
  getCoachUpstreamProvider,
  type CoachUpstreamProvider,
} from '@/api/ai/core/coach-upstream.adapter';
import type { AiDataConsentSource } from './ai-data-consent.dto';
import { emitAiDataConsentChanged } from './ai-data-consent.events';
import { isSelfHostEnvironment } from '@/runtime-capabilities/runtime-capability.resolver';

// v3 adds explicit cross-conversation Athlete Memory processing. Enabling
// Memory therefore cannot reuse a grant made for the older transient AI flow.
export const AI_DATA_CONSENT_VERSION = '2026-10-11-v3-athlete-memory';

type StoredAiDataConsent = {
  version: string;
  provider: string;
  recipient: string;
  granted: boolean;
  decidedAt: string;
  locale?: string;
  source: AiDataConsentSource;
};

export type AiDataConsentStatus = {
  state:
    | 'UNAVAILABLE'
    | 'UNDECIDED'
    | 'GRANTED'
    | 'DECLINED'
    | 'RECONSENT_REQUIRED';
  granted: boolean;
  promptRequired: boolean;
  /** @deprecated Use promptRequired. Kept temporarily for older clients. */
  required: boolean;
  version: string;
  provider: CoachUpstreamProvider | null;
  recipient: string;
  decidedAt: string | null;
};

function providerRecipient(provider: CoachUpstreamProvider | null) {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'deepseek') {
    return 'DeepSeek (Hangzhou DeepSeek Artificial Intelligence Co., Ltd.)';
  }
  if (provider === 'aliyun') return 'Alibaba Cloud Model Studio (DashScope)';
  if (provider === 'openrouter') return 'OpenRouter';
  if (provider === 'gemini') return 'Google Gemini API';
  if (provider === 'xai') return 'xAI';
  if (provider === 'ollama') return 'the locally configured Ollama service';
  return 'the configured AI service provider';
}

function parseStoredConsent(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredAiDataConsent>;
    if (
      typeof parsed.version !== 'string' ||
      typeof parsed.provider !== 'string' ||
      typeof parsed.recipient !== 'string' ||
      typeof parsed.granted !== 'boolean' ||
      typeof parsed.decidedAt !== 'string' ||
      typeof parsed.source !== 'string'
    ) {
      return null;
    }
    return parsed as StoredAiDataConsent;
  } catch {
    return null;
  }
}

@Injectable()
export class AiDataConsentService {
  constructor(
    private readonly users: UserQueryService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async getStatus(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AiDataConsentStatus> {
    const provider = getCoachUpstreamProvider();
    const recipient = providerRecipient(provider);
    // In Self-host the instance Owner chooses and configures the upstream.
    // That instance-level action replaces the per-account Cloud consent flow.
    if (isSelfHostEnvironment(process.env)) {
      const granted = provider !== null;
      return {
        state: granted ? 'GRANTED' : 'UNAVAILABLE',
        granted,
        promptRequired: false,
        required: false,
        version: 'self-host-owner-configuration-v1',
        provider,
        recipient,
        decidedAt: null,
      };
    }
    const row = await this.users.settings(tx).findUnique({
      where: {
        userId_category: {
          userId,
          category: $Enums.SettingCategory.AI_DATA_CONSENT,
        },
      },
      select: { value: true },
    });
    const stored = parseStoredConsent(row?.value);
    const state: AiDataConsentStatus['state'] = !provider
      ? 'UNAVAILABLE'
      : !stored
        ? 'UNDECIDED'
        : stored.granted === false
          ? 'DECLINED'
          : stored.version === AI_DATA_CONSENT_VERSION &&
              stored.provider === provider
            ? 'GRANTED'
            : 'RECONSENT_REQUIRED';
    const granted = state === 'GRANTED';
    const promptRequired =
      state === 'UNDECIDED' || state === 'RECONSENT_REQUIRED';

    return {
      state,
      granted,
      promptRequired,
      required: promptRequired,
      version: AI_DATA_CONSENT_VERSION,
      provider,
      recipient,
      decidedAt: stored?.decidedAt ?? null,
    };
  }

  async recordDecision(args: {
    userId: string;
    granted: boolean;
    source: AiDataConsentSource;
    locale?: string;
  }): Promise<AiDataConsentStatus> {
    const provider = getCoachUpstreamProvider();
    if (args.granted && !provider) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNPROCESSABLE_ENTITY,
        message: 'AI_PROVIDER_UNAVAILABLE',
      });
    }
    const recipient = providerRecipient(provider);
    const record: StoredAiDataConsent = {
      version: AI_DATA_CONSENT_VERSION,
      provider: provider ?? 'unconfigured',
      recipient,
      granted: args.granted,
      decidedAt: new Date().toISOString(),
      ...(args.locale?.trim() ? { locale: args.locale.trim() } : {}),
      source: args.source,
    };

    await this.users.settings().upsert({
      where: {
        userId_category: {
          userId: args.userId,
          category: $Enums.SettingCategory.AI_DATA_CONSENT,
        },
      },
      update: { value: JSON.stringify(record) },
      create: {
        userId: args.userId,
        category: $Enums.SettingCategory.AI_DATA_CONSENT,
        value: JSON.stringify(record),
      },
    });

    await emitAiDataConsentChanged(this.events, {
      userId: args.userId,
      granted: args.granted,
      decidedAt: record.decidedAt,
    });

    return this.getStatus(args.userId);
  }

  async isGranted(userId: string, tx?: Prisma.TransactionClient) {
    return (await this.getStatus(userId, tx)).granted;
  }

  async assertGranted(userId: string) {
    if (await this.isGranted(userId)) return;
    throw new BusinessException({
      code: BUSINESS_ERROR_CODE.AI_DATA_CONSENT_REQUIRED,
      message: 'AI_DATA_CONSENT_REQUIRED',
    });
  }
}
