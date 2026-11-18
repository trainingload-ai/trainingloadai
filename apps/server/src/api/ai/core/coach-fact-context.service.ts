import { CoachTrainingFactContextService } from './coach-training-fact-context.service';
import { AiDataConsentService } from '@/ai-data-consent/ai-data-consent.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { Injectable, Optional } from '@nestjs/common';
import { HealthDataQueryService } from '@/health-data/health-data-query.service';
import { AthleteMemoryQueryService } from '@/athlete-memory/application/athlete-memory-query.service';
import { sha256Hex, stableJson } from './ai-common.util';

/** Compose existing domain owners; this projection never owns or copies their facts. */
@Injectable()
export class CoachFactContextService {
  constructor(
    private readonly health: HealthDataQueryService,
    private readonly memory: AthleteMemoryQueryService,
    private readonly consent: AiDataConsentService,
    private readonly users: UserQueryService,
    @Optional() private readonly training?: CoachTrainingFactContextService,
  ) {}

  async build(input: {
    userId: string;
    date: string;
    timezone: string;
    allowAi: boolean;
    allowWithoutConsent?: boolean;
  }) {
    const [user, consent] = await Promise.all([
      this.users.users().findUnique({
        where: { id: input.userId },
        select: { accountDeletionRequestedAt: true },
      }),
      input.allowWithoutConsent ? true : this.consent.isGranted(input.userId),
    ]);
    if (!input.allowAi || !consent || !user || user.accountDeletionRequestedAt)
      return {
        date: input.date,
        timezone: input.timezone,
        revision: 'disabled',
        status: 'DISABLED',
        health: null,
        memory: null,
        limitations: ['AI data use is disabled.'],
      };
    const asOf = new Date();
    const [healthRead, memoryRead, trainingRead] = await Promise.allSettled([
      this.health.getCoachingFacts(input.userId, input.date, asOf),
      this.memory.coachingContext({
        userId: input.userId,
        asOf,
        timezone: input.timezone,
      }),
      this.training?.build(input.userId, input.date, input.timezone) ??
        Promise.resolve(null),
    ]);
    const health = healthRead.status === 'fulfilled' ? healthRead.value : null;
    const memory = memoryRead.status === 'fulfilled' ? memoryRead.value : null;
    const limitations: string[] = [];
    const training =
      trainingRead.status === 'fulfilled' ? trainingRead.value : null;
    if (training?.truncated)
      limitations.push('TRAINING_CONTEXT_EXCEEDS_BUDGET');
    if (trainingRead.status === 'rejected')
      limitations.push('TRAINING_READ_UNAVAILABLE');
    if (health?.truncated) limitations.push('HEALTH_CONTEXT_EXCEEDS_BUDGET');
    if (!health) limitations.push('HEALTH_READ_UNAVAILABLE');
    if (!memory || memory.snapshot.unavailable)
      limitations.push('MEMORY_READ_UNAVAILABLE');
    if (memory?.snapshot.disabled) limitations.push('MEMORY_DISABLED');
    if (memory?.extraction.length)
      limitations.push('USER_REPORT_EXTRACTION_PENDING_OR_FAILED');
    if (memory?.snapshot.omittedSafetyConstraints)
      limitations.push('SAFETY_CONTEXT_EXCEEDS_BUDGET');
    const dependency = {
      policy: 'coach-fact-context-v1',
      date: input.date,
      timezone: input.timezone,
      health,
      training,
      memory: memory
        ? {
            disabled: memory.snapshot.disabled ?? false,
            unavailable: memory.snapshot.unavailable ?? false,
            revision:
              memory.snapshot.semanticRevision ??
              stableJson(memory.snapshot.items),
            extraction: memory.extraction.map((job) => ({
              id: job.id,
              status: job.status === 'DEAD' ? 'UNAVAILABLE' : 'PENDING',
            })),
          }
        : null,
      limitations,
    };
    return {
      date: input.date,
      timezone: input.timezone,
      revision: sha256Hex(stableJson(dependency)),
      status: limitations.some(
        (value) =>
          value.endsWith('UNAVAILABLE') || value.endsWith('EXCEEDS_BUDGET'),
      )
        ? 'LIMITED'
        : 'AVAILABLE',
      health,
      training,
      memory: memory
        ? { ...memory.snapshot, asOf: undefined, estimatedTokens: undefined }
        : null,
      limitations,
    };
  }
}
