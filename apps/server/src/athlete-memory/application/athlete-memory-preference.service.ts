import { Injectable } from '@nestjs/common';
import { SettingCategory, type Prisma } from '@prisma/client';
import { UserQueryService } from '@/api/user/user-query.service';
import { AiDataConsentService } from '@/ai-data-consent/ai-data-consent.service';
import { isSelfHostEnvironment } from '@/runtime-capabilities/runtime-capability.resolver';

export type MemoryPreference = {
  available: boolean;
  /** The user's independent memory preference. Defaults to enabled. */
  enabled: boolean;
  /** Whether memory can currently read/write after runtime policy checks. */
  effectiveEnabled: boolean;
  updatedAt: string | null;
  consentRequired: boolean;
};

type StoredMemoryPreference = {
  enabled: boolean;
  updatedAt: string | null;
};

function parse(
  value: string | null | undefined,
): StoredMemoryPreference | null {
  if (value == null) return null;
  try {
    const parsed = JSON.parse(
      String(value ?? ''),
    ) as Partial<StoredMemoryPreference>;
    return {
      enabled: parsed.enabled === true,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch {
    return { enabled: false, updatedAt: null };
  }
}

@Injectable()
export class AthleteMemoryPreferenceService {
  constructor(
    private readonly users: UserQueryService,
    private readonly consent: AiDataConsentService,
  ) {}

  async get(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MemoryPreference> {
    const [row, consent] = await Promise.all([
      this.users.settings(tx).findUnique({
        where: {
          userId_category: {
            userId,
            category: SettingCategory.ATHLETE_MEMORY,
          },
        },
        select: { value: true },
      }),
      this.consent.getStatus(userId, tx),
    ]);
    const stored = parse(row?.value);
    const selfHost = isSelfHostEnvironment(process.env);
    const consentRequired = !selfHost && !consent.granted;
    // Memory preference is independent from AI consent. Consent only controls
    // whether that preference can currently take effect in managed Cloud.
    const enabled = stored?.enabled ?? true;
    return {
      available: true,
      enabled,
      effectiveEnabled: enabled && !consentRequired,
      updatedAt: stored?.updatedAt ?? null,
      consentRequired,
    };
  }

  async isEnabled(userId: string, tx?: Prisma.TransactionClient) {
    const preference = await this.get(userId, tx);
    return preference.effectiveEnabled;
  }

  async set(userId: string, enabled: boolean) {
    await this.write(userId, enabled);
    return this.get(userId);
  }

  private async write(userId: string, enabled: boolean) {
    const preference: StoredMemoryPreference = {
      enabled,
      updatedAt: new Date().toISOString(),
    };
    await this.users.settings().upsert({
      where: {
        userId_category: { userId, category: SettingCategory.ATHLETE_MEMORY },
      },
      create: {
        userId,
        category: SettingCategory.ATHLETE_MEMORY,
        value: JSON.stringify(preference),
      },
      update: { value: JSON.stringify(preference) },
    });
  }
}
