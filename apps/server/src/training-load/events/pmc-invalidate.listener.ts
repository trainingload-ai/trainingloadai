import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import { PMCService } from '../pmc.service';
import { PMC_INVALIDATE_EVENT, type PmcInvalidateEvent } from './pmc.events';
import { emitAthleteStateReassessRequested } from '@/athlete-state/athlete-state.events';

dayjs.extend(utc);

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
        event.endDate ?? dayjs.utc().add(1, 'day').endOf('day').toDate();
      this.logger.log(
        `[pmc.invalidate] windowed recalculate userId=${event.userId}`,
      );
      await this.pmc.calculatePMC({
        userId: event.userId,
        startDate: event.startDate,
        endDate,
        requestAthleteStateUpdate: !event.suppressAthleteStateReassessment,
      });

      return;
    }

    this.logger.log(
      `[pmc.invalidate] full window recalculate userId=${event.userId}`,
    );
    await this.pmc.recalculatePMC(
      event.userId,
      !event.suppressAthleteStateReassessment,
    );
  }
}
