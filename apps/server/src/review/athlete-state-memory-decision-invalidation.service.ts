import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CoachDecisionState } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  ATHLETE_MEMORY_CHANGED_EVENT,
  type AthleteMemoryChangedEvent,
} from '@/athlete-memory/domain/athlete-memory.events';

/**
 * A plan Decision is outside AthleteStateModule's ownership, but it must not
 * survive the evidence that produced it. Review owns this small bridge so the
 * state module never reaches into CoachDecision or plan mutation delegates.
 */
@Injectable()
export class AthleteStateMemoryDecisionInvalidationService {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(ATHLETE_MEMORY_CHANGED_EVENT, { suppressErrors: false })
  async handle(event: AthleteMemoryChangedEvent) {
    await this.prisma.coachDecision.updateMany({
      where: {
        state: {
          in: [
            CoachDecisionState.DRAFT,
            CoachDecisionState.PROPOSED,
            CoachDecisionState.APPROVED,
          ],
        },
        assessmentCases: { some: { userId: event.userId } },
      },
      data: { state: CoachDecisionState.SUPERSEDED },
    });
  }
}
