import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import dayjs = require('dayjs');
import { PMCService } from '../pmc.service';
import { PMC_INVALIDATE_EVENT, type PmcInvalidateEvent } from './pmc.events';
import { emitAthleteStateReassessRequested } from '@/athlete-state/athlete-state.events';

@Injectable()
export class PmcInvalidateListener {
  private readonly logger = new Logger(PmcInvalidateListener.name);

  constructor(
    private readonly pmc: PMCService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  @OnEvent(PMC_INVALIDATE_EVENT)
  async handle(event: PmcInvalidateEvent) {
    if (event.startDate) {
      const endDate =
        event.endDate ?? dayjs().add(1, 'day').endOf('day').toDate();
      this.logger.log(
        `[pmc.invalidate] windowed recalculate userId=${event.userId}`,
      );
      await this.pmc.calculatePMC({
        userId: event.userId,
        startDate: event.startDate,
        endDate,
      });
      await emitAthleteStateReassessRequested(this.events, {
        userId: event.userId,
        triggerType: 'PMC_UPDATED',
      });
      return;
    }

    this.logger.log(
      `[pmc.invalidate] full window recalculate userId=${event.userId}`,
    );
    await this.pmc.recalculatePMC(event.userId);
    await emitAthleteStateReassessRequested(this.events, {
      userId: event.userId,
      triggerType: 'PMC_UPDATED',
    });
  }
}
