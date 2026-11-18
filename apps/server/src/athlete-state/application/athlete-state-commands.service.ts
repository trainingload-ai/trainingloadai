import { Injectable } from '@nestjs/common';
import { AthleteStateRepository } from '../infrastructure/athlete-state.repository';
import type {
  AthleteStateAssessmentResult,
  AssessmentEvidence,
} from '../domain/athlete-state.contracts';

@Injectable()
export class AthleteStateCommands {
  constructor(private readonly repository: AthleteStateRepository) {}

  saveAssessment(input: {
    userId: string;
    evidence: AssessmentEvidence;
    result: AthleteStateAssessmentResult;
    model?: string;
    promptVersion?: string;
  }) {
    return this.repository.saveAssessment(input);
  }

  invalidate(userId: string) {
    return this.repository.invalidateForUser(userId);
  }

  isAssessmentAnswerSource(userId: string, sourceMessageId: string) {
    return this.repository.isAssessmentAnswerSource(userId, sourceMessageId);
  }
}
