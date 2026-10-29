import { Injectable } from '@nestjs/common';
import { AthleteStateEvidenceService } from './athlete-state-evidence.service';
import { AthleteStateRepository } from '../infrastructure/athlete-state.repository';
import type {
  AthleteStateAssessmentResult,
  BuiltAthleteStateEvidence,
} from '../domain/athlete-state.contracts';

@Injectable()
export class AthleteStateCommands {
  constructor(
    private readonly evidence: AthleteStateEvidenceService,
    private readonly repository: AthleteStateRepository,
  ) {}

  buildEvidence(input: {
    userId: string;
    asOf?: Date;
    timezone: string;
    scopedAnswers?: Array<Record<string, unknown>>;
  }) {
    return this.evidence.build(input);
  }

  saveAssessment(input: {
    userId: string;
    evidence: BuiltAthleteStateEvidence;
    result: AthleteStateAssessmentResult;
    model?: string;
    promptVersion?: string;
    preserveCaseId?: string;
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
