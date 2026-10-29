import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { UpdateSelfHostTelemetryConsentDto } from './dto/update-self-host-telemetry-consent.dto';
import {
  SELF_HOST_TELEMETRY_CONSENT_VERSION,
  type SelfHostTelemetryConsentSource,
  type SelfHostTelemetryConsentView,
} from './self-host-telemetry-consent.types';

type StoredConsent = {
  telemetryConsentGranted: boolean | null;
  telemetryConsentVersion: string | null;
  telemetryConsentSource: string | null;
  telemetryConsentUpdatedAt: Date | null;
};

@Injectable()
export class SelfHostTelemetryConsentService {
  constructor(private readonly prisma: PrismaService) {}

  private view(stored: StoredConsent): SelfHostTelemetryConsentView {
    const source =
      stored.telemetryConsentSource === 'ONBOARDING' ||
      stored.telemetryConsentSource === 'SETTINGS'
        ? (stored.telemetryConsentSource as SelfHostTelemetryConsentSource)
        : null;
    return {
      granted:
        stored.telemetryConsentVersion === SELF_HOST_TELEMETRY_CONSENT_VERSION
          ? stored.telemetryConsentGranted
          : null,
      version: SELF_HOST_TELEMETRY_CONSENT_VERSION,
      source,
      updatedAt: stored.telemetryConsentUpdatedAt?.toISOString() ?? null,
    };
  }

  async getConsent(): Promise<SelfHostTelemetryConsentView> {
    const stored = await this.prisma.selfHostInstance.findUnique({
      where: { id: 1 },
      select: {
        telemetryConsentGranted: true,
        telemetryConsentVersion: true,
        telemetryConsentSource: true,
        telemetryConsentUpdatedAt: true,
      },
    });
    if (!stored) throw new NotFoundException('Self-host instance is missing');
    return this.view(stored);
  }

  async updateConsent(
    input: UpdateSelfHostTelemetryConsentDto,
  ): Promise<SelfHostTelemetryConsentView> {
    const stored = await this.prisma.selfHostInstance.update({
      where: { id: 1 },
      data: {
        telemetryConsentGranted: input.granted,
        telemetryConsentVersion: SELF_HOST_TELEMETRY_CONSENT_VERSION,
        telemetryConsentSource: input.source,
        telemetryConsentUpdatedAt: new Date(),
      },
      select: {
        telemetryConsentGranted: true,
        telemetryConsentVersion: true,
        telemetryConsentSource: true,
        telemetryConsentUpdatedAt: true,
      },
    });
    return this.view(stored);
  }
}
