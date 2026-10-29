import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AthleteMemoryPreferenceService } from '@/athlete-memory/application/athlete-memory-preference.service';
import { MEMORY_POLICY_VERSION } from '@/athlete-memory/domain/memory-operation';
import { AiDataConsentService } from '@/ai-data-consent/ai-data-consent.service';

@Injectable()
export class CoachMemoryExtractionEnqueuer {
  constructor(
    private readonly preferences: AthleteMemoryPreferenceService,
    private readonly consent: AiDataConsentService,
  ) {}

  async enqueueEligibleMessage(input: {
    tx: Prisma.TransactionClient;
    userId: string;
    sessionId: string;
    sourceMessageId: string;
    content: string;
    hasStructuredUserInput?: boolean;
    policyVersion?: string;
  }) {
    // This method must only perform bounded database work. The caller supplies
    // the message transaction so USER message + PENDING job commit atomically;
    // the worker is the only place allowed to call the remote Judge.
    if (!input.content.trim() && !input.hasStructuredUserInput) return null;
    // Consent and preference are read through the caller's transaction. This
    // avoids a second pooled connection and keeps eligibility aligned with the
    // user message + job commit boundary.
    if (!(await this.consent.isGranted(input.userId, input.tx))) return null;
    if (!(await this.preferences.isEnabled(input.userId, input.tx)))
      return null;
    const policyVersion = input.policyVersion ?? MEMORY_POLICY_VERSION;
    return input.tx.aiCoachMemoryExtractionJob.upsert({
      where: {
        sourceMessageId_policyVersion: {
          sourceMessageId: input.sourceMessageId,
          policyVersion,
        },
      },
      create: {
        userId: input.userId,
        sessionId: input.sessionId,
        sourceMessageId: input.sourceMessageId,
        policyVersion,
      },
      update: {},
      select: { id: true },
    });
  }
}
