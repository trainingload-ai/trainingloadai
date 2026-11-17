import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { CoachFactScopeValidator } from '../core/coach-fact-scope.port';
import { TodaySuggestionConstraintProjector } from './today-suggestion-constraint.projector';
import { todayCoachingFactScopes } from './today-suggestion-fact-scopes';

@Injectable()
export class CurrentCoachFactScopeValidator implements CoachFactScopeValidator {
  constructor(private readonly projector: TodaySuggestionConstraintProjector) {}
  async current(userId: string) {
    const projection = await this.projector.project({
      userId,
      locale: 'en',
      allowAi: true,
    });
    if (
      (projection.lightContext.sharedFacts as { status?: string } | undefined)
        ?.status === 'LIMITED'
    )
      throw new ServiceUnavailableException(
        'COACH_FACTS_TEMPORARILY_UNAVAILABLE',
      );
    return todayCoachingFactScopes(projection);
  }
}
