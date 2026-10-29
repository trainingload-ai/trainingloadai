import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ATHLETE_MEMORY_CHANGED_EVENT,
  type AthleteMemoryChangedEvent,
} from '@/athlete-memory/domain/athlete-memory.events';
import { AthleteStateCommands } from './athlete-state-commands.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAthleteStateReassessRequested } from '../athlete-state.events';

@Injectable()
export class AthleteStateMemoryInvalidationListener {
  constructor(
    private readonly commands: AthleteStateCommands,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(ATHLETE_MEMORY_CHANGED_EVENT, { suppressErrors: false })
  async handle(event: AthleteMemoryChangedEvent) {
    // A structured Case answer is persisted before both scoped reassessment
    // and asynchronous Memory extraction. That answer is already present in
    // the scoped evidence, so its later Memory projection must not supersede
    // the very Case that is evaluating it.
    if (
      event.sourceMessageId &&
      (await this.commands.isAssessmentAnswerSource(
        event.userId,
        event.sourceMessageId,
      ))
    ) {
      return;
    }
    await this.commands.invalidate(event.userId);
    await emitAthleteStateReassessRequested(this.events, {
      userId: event.userId,
      triggerType: 'MEMORY_CHANGED',
      triggerRef: event.change,
    });
  }
}
