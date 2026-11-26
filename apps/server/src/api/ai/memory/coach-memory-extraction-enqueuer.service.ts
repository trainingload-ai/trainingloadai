import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CoachUserMessageBody } from '../core/coach-query-yield';
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
    message?: CoachUserMessageBody;
    policyVersion?: string;
  }) {
    // This method must only perform bounded database work. The caller supplies
    // the message transaction so USER message + PENDING job commit atomically;
    // the worker is the only place allowed to call the remote Judge.
    if (!input.content.trim() && !input.message?.content.length) return null;
    // A creation form can include defaults and constraints scoped to one plan.
    if (
      input.message?.content.some(
        (block) =>
          block.type === 'tool_result' &&
          block.tool_use_id === 'client:ai_plan_seed',
      )
    )
      return null;
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
