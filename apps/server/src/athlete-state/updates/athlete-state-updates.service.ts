import { normalizeIanaTimezone } from '@/timezone/user-timezone-initializer.service';
import { withinStateEvidenceWindow } from './athlete-state-update-policy';
import { automaticStateUpdatesSuppressed } from './athlete-state-update-scope';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/prisma/prisma.service';
import type { PrismaTx } from '@/prisma/prisma-db';
import { AiDataConsentService } from '@/ai-data-consent/ai-data-consent.service';
import { AiDataConsentState } from '@/ai-data-consent/ai-data-consent.types';
import { AthleteStateUpdateSkipReason } from './athlete-state-update.types';
import {
  FEATURE_ACCESS_POLICY,
  type FeatureAccessPolicy,
} from '@/access/feature-access-policy.port';
import { featureAllowed } from '@/access/feature-access.types';
import {
  AthleteStateUpdateQueue,
  type StateUpdateRequest,
} from './athlete-state-update-queue.service';
import { $Enums } from '@prisma/client';

export const ATHLETE_STATE_UPDATE_WAKE = 'athlete-state.update-wake.v1';
export const athleteStateAutoEnabled = (value?: string | null) =>
  !['false', '0', 'no'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  );

/** Eligibility is separate from the database-only queue and never reads evidence. */
@Injectable()
export class AthleteStateUpdates {
  private readonly logger = new Logger(AthleteStateUpdates.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: AthleteStateUpdateQueue,
    private readonly consent: AiDataConsentService,
    @Inject(FEATURE_ACCESS_POLICY) private readonly access: FeatureAccessPolicy,
    @Optional() private readonly events?: EventEmitter2,
  ) {}
  /**
   * Check if the athlete is eligible for an athlete state update.
   * @param userId Athlete whose access is checked.
   * @param explicit User-initiated answers bypass only the automation preference.
   * @param tx Optional transaction containing the source data change.
   * @returns A stable skip reason, or null when eligible.
   */
  async eligibility(
    userId: string,
    explicit = false,
    tx?: PrismaTx,
  ): Promise<AthleteStateUpdateSkipReason | null> {
    if (!explicit) {
      const setting = await (tx ?? this.prisma).userSetting.findUnique({
        where: {
          userId_category: {
            userId,
            category: $Enums.SettingCategory.ATHLETE_STATE_AUTO_ENABLED,
          },
        },
        select: { value: true },
      });
      if (!athleteStateAutoEnabled(setting?.value))
        return AthleteStateUpdateSkipReason.AUTOMATION_DISABLED;
    }
    const consent = await this.consent.getStatus(userId, tx);
    if (!consent.granted)
      return consent.state === AiDataConsentState.UNAVAILABLE
        ? AthleteStateUpdateSkipReason.AI_PROVIDER_UNAVAILABLE
        : AthleteStateUpdateSkipReason.AI_DATA_CONSENT_REQUIRED;
    if (
      !featureAllowed(
        await this.access.evaluate(userId, ['ai.coach']),
        'ai.coach',
      )
    )
      return AthleteStateUpdateSkipReason.FEATURE_ACCESS_REQUIRED;
    return null;
  }

  wake(userId: string) {
    return this.events?.emitAsync(ATHLETE_STATE_UPDATE_WAKE, { userId });
  }

  async requestUpdate(input: StateUpdateRequest, tx?: PrismaTx) {
    if (!input.explicit && automaticStateUpdatesSuppressed())
      return {
        status: 'SKIPPED' as const,
        reason: AthleteStateUpdateSkipReason.MAINTENANCE,
      };
    const reason = await this.eligibility(
      input.userId,
      input.explicit === true,
      tx,
    );
    if (reason) {
      this.logger.debug(
        `Athlete State update skipped reason=${reason} trigger=${input.triggerType}`,
      );
      return { status: 'SKIPPED' as const, reason };
    }
    if (input.healthDate) {
      const timezone = await (tx ?? this.prisma).userBodyMetric.findFirst({
        where: { userId: input.userId, type: 'TIMEZONE' },
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
        select: { value: true },
      });
      if (
        !withinStateEvidenceWindow(
          input.healthDate,
          normalizeIanaTimezone(timezone?.value) ?? 'UTC',
        )
      )
        return {
          status: 'SKIPPED' as const,
          reason: AthleteStateUpdateSkipReason.OUTSIDE_EVIDENCE_WINDOW,
        };
    }
    const job = await this.queue.requestUpdate(input, tx);
    let current = job;
    this.logger.debug(
      `Athlete State update queued task=${job.user_id} mode=${input.mode ?? 'queued'} trigger=${input.triggerType} version=${job.requested_version}`,
    );
    // Never dispatch before an enclosing fact transaction commits. Polling is
    // the durable fallback, including transactions whose caller cannot signal.
    if (!tx && input.mode === 'immediate') {
      await this.wake(input.userId);
      current = (await this.queue.find(input.userId)) ?? job;
    }
    return {
      status: current.status,
      taskId: job.user_id,
      version: job.requested_version,
      availableAt: current.available_at,
      completedVersion: current.completed_version,
    };
  }
}
