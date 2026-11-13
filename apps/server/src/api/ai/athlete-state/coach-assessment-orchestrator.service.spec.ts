import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { featureAccessSnapshot } from '@/access/feature-access.types';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import type { AthleteStateAssessmentResult } from '@/athlete-state/domain/athlete-state.contracts';
import {
  CoachAssessmentOrchestratorService,
  shouldModelFollowupOutcome,
} from './coach-assessment-orchestrator.service';

function createOrchestrator() {
  const consent = { assertGranted: jest.fn(async (_userId: string) => {}) };
  const access = {
    evaluate: jest.fn(async () =>
      featureAccessSnapshot({ allowed: true, reason: 'GRANTED' }),
    ),
  };
  const commands = {
    buildEvidence: jest.fn(async () => ({ evidenceHash: 'new-evidence' })),
  };
  const users = {
    getPreferredTimezone: jest.fn(async () => 'UTC'),
    getPreferredLocale: jest.fn(async () => 'en'),
  };
  const queries = { reusable: jest.fn(async () => null) };
  const model = {
    assess: jest.fn(async () => {
      throw new Error('MODEL_TEST_STOP');
    }),
  };
  const updates = {
    eligibility: jest.fn(async () => null),
    requestUpdate: jest.fn(async (_input: unknown) => ({ status: 'PENDING' })),
  };
  const service = new CoachAssessmentOrchestratorService(
    commands as never,
    queries as never,
    {
      evidenceEnabled: () => true,
      assessmentShadowEnabled: () => true,
    } as never,
    users as never,
    {} as never,
    model as never,
    {} as never,
    {} as never,
    consent as never,
    updates as never,
    access as never,
  );
  return { service, consent, access, commands, users, queries, model, updates };
}

describe('Athlete State assessment eligibility', () => {
  const input = {
    userId: 'athlete',
    triggerType: 'ACTIVITY_READY',
    triggerRef: 'batch',
  };

  it('does not read evidence, profile or cached assessments without data consent', async () => {
    const f = createOrchestrator();
    const denied = new BusinessException({
      code: BUSINESS_ERROR_CODE.AI_DATA_CONSENT_REQUIRED,
      message: 'AI_DATA_CONSENT_REQUIRED',
    });
    f.consent.assertGranted.mockRejectedValueOnce(denied);
    await expect(f.service.assess(input)).rejects.toBe(denied);
    expect(f.access.evaluate).not.toHaveBeenCalled();
    expect(f.users.getPreferredTimezone).not.toHaveBeenCalled();
    expect(f.commands.buildEvidence).not.toHaveBeenCalled();
    expect(f.queries.reusable).not.toHaveBeenCalled();
    expect(f.model.assess).not.toHaveBeenCalled();
  });

  it('does not build evidence when the coaching feature is disabled for the account', async () => {
    const f = createOrchestrator();
    f.access.evaluate.mockResolvedValueOnce(
      featureAccessSnapshot({ allowed: false, reason: 'FEATURE_DISABLED' }),
    );
    await expect(f.service.assess(input)).rejects.toThrow('AI_ACCESS_REQUIRED');
    expect(f.consent.assertGranted).toHaveBeenCalledWith('athlete');
    expect(f.commands.buildEvidence).not.toHaveBeenCalled();
    expect(f.queries.reusable).not.toHaveBeenCalled();
  });

  it('keeps authorized activity-triggered assessment available', async () => {
    const f = createOrchestrator();
    await expect(f.service.assess(input)).rejects.toThrow('MODEL_TEST_STOP');
    expect(f.access.evaluate).toHaveBeenCalledWith('athlete', ['ai.coach']);
    expect(f.commands.buildEvidence).toHaveBeenCalledTimes(1);
    expect(f.model.assess).toHaveBeenCalledTimes(1);
  });

  it('does not turn a consent lookup outage into permission to read evidence', async () => {
    const f = createOrchestrator();
    f.consent.assertGranted.mockRejectedValueOnce(
      new Error('CONSENT_STORE_UNAVAILABLE'),
    );
    await expect(f.service.assess(input)).rejects.toThrow(
      'CONSENT_STORE_UNAVAILABLE',
    );
    expect(f.commands.buildEvidence).not.toHaveBeenCalled();
  });

  it('persists background requests without reading evidence or calling a model inline', async () => {
    const f = createOrchestrator();
    const event = { ...input, requestedAt: new Date().toISOString() };
    await f.service.handleRequested(event);
    expect(f.updates.requestUpdate).toHaveBeenCalledWith(event);
    expect(f.commands.buildEvidence).not.toHaveBeenCalled();
    expect(f.model.assess).not.toHaveBeenCalled();
  });
  it('propagates queue persistence failures so the durable source can retry', async () => {
    const f = createOrchestrator();
    f.updates.requestUpdate.mockRejectedValueOnce(
      new Error('QUEUE_UNAVAILABLE'),
    );
    await expect(
      f.service.handleRequested({
        ...input,
        requestedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow('QUEUE_UNAVAILABLE');
    expect(f.commands.buildEvidence).not.toHaveBeenCalled();
  });
});

function result(
  decisionReadiness: AthleteStateAssessmentResult['decisionReadiness'],
  evidenceRequests: AthleteStateAssessmentResult['evidenceRequests'] = [],
): AthleteStateAssessmentResult {
  return {
    state: 'UNDER_RECOVERED',
    confidence: 0.7,
    decisionReadiness,
    dimensions: [],
    hypotheses: [],
    evidenceRequests,
    safetyFlags: [],
    limitations: [],
  };
}

const sleepRequest = {
  kind: 'RECENT_SLEEP',
  reason: 'Sleep context may change the recommendation.',
  decisionImpact: 'Distinguishes an isolated disruption from ongoing strain.',
  question: {
    id: 'sleep_context',
    header: 'Sleep',
    question: 'Why was sleep shorter than usual?',
    options: [
      { value: 'travel', label: 'Travel', description: 'Travel disrupted it.' },
      { value: 'stress', label: 'Stress', description: 'Stress disrupted it.' },
    ],
  },
};

describe('shouldModelFollowupOutcome', () => {
  it('keeps the first distinct evidence request as a question', () => {
    expect(
      shouldModelFollowupOutcome({
        result: result('NEEDS_USER_INPUT', [sleepRequest]),
        questionCount: 1,
        previousEvidenceKinds: ['ILLNESS_SYMPTOM_CHECK'],
      }),
    ).toBe(false);
  });

  it('models a conservative outcome after the two-question budget is spent', () => {
    expect(
      shouldModelFollowupOutcome({
        result: result('NEEDS_USER_INPUT', [sleepRequest]),
        questionCount: 2,
        previousEvidenceKinds: ['ILLNESS_SYMPTOM_CHECK', 'RECENT_SLEEP'],
      }),
    ).toBe(true);
  });

  it('does not model an outcome while a material source is syncing', () => {
    expect(
      shouldModelFollowupOutcome({
        result: result('WAITING_FOR_SYNC'),
        questionCount: 2,
        previousEvidenceKinds: [],
      }),
    ).toBe(false);
  });
});
