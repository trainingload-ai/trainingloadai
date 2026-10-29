import { Injectable, Logger, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PostgresPublicReviewQuotaStore } from './public-review-quota.store';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';

@Injectable()
export class PublicReviewReservationReaper {
  private readonly logger = new Logger(PublicReviewReservationReaper.name);

  constructor(
    private readonly store: PostgresPublicReviewQuotaStore,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
  ) {}

  @Interval(60_000)
  async reclaimExpired() {
    if (this.capabilities?.isEnabled('ai') === false) return;
    try {
      const reclaimed = await this.store.expireStaleReservations();
      if (reclaimed > 0) {
        this.logger.log(
          `reclaimed=${reclaimed} expired public review reservations`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `reservation cleanup failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    }
  }
}
