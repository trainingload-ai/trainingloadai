import type {
  AthleteStateDecisionReadiness,
  AthleteStateStatus,
} from '@prisma/client';

export type RecordedMetricPoint = {
  date: string;
  value: number;
  unit: string | null;
  provider: string;
};

export type RobustBaseline = {
  metric: string;
  provider: string | null;
  sampleCount: number;
  requiredSampleCount: number;
  median: number | null;
  mad: number | null;
  recentMedian: number | null;
  robustZ: number | null;
  providerContinuous: boolean;
};

export type AthleteStateEvidenceRequest = {
  kind: string;
  reason: string;
  decisionImpact: string;
  question: {
    id: string;
    header: string;
    question: string;
    options: Array<{
      value: string;
      label: string;
      description: string;
    }>;
  };
};

export type AthleteStateEvidenceSnapshot = {
  schemaVersion: 1;
  policyVersion: string;
  asOf: string;
  localDate: string;
  timezone: string;
  recordedFacts: {
    physiology: Record<string, RecordedMetricPoint[]>;
    training: {
      activities: Array<Record<string, unknown>>;
      pmc: Array<Record<string, unknown>>;
    };
    subjective: Array<Record<string, unknown>>;
    scopedAnswers: Array<Record<string, unknown>>;
  };
  deterministicFeatures: {
    physiology: RobustBaseline[];
    trainingLoad: Record<string, unknown>;
    recoverySpacing: Record<string, unknown>;
    performanceResponse: Array<Record<string, unknown>>;
  };
  modeledMetrics: {
    pmc: Array<Record<string, unknown>>;
  };
  missingEvidence: Array<{
    kind: string;
    reason: string;
    requiredForDecision: boolean;
  }>;
  freshness: {
    latestSourceAt: string | null;
    sourceDates: Record<string, string | null>;
  };
};

export type AthleteStateAssessmentResult = {
  state: AthleteStateStatus;
  confidence: number;
  decisionReadiness: AthleteStateDecisionReadiness;
  dimensions: Array<Record<string, unknown>>;
  hypotheses: Array<Record<string, unknown>>;
  evidenceRequests: AthleteStateEvidenceRequest[];
  safetyFlags: Array<Record<string, unknown>>;
  limitations: string[];
};

export type BuiltAthleteStateEvidence = {
  /** Redacted immutable snapshot safe to persist on the Assessment. */
  snapshot: AthleteStateEvidenceSnapshot;
  /** Bounded model-only view; never persisted because it includes Memory claims. */
  modelSnapshot: AthleteStateEvidenceSnapshot;
  evidenceHash: string;
  latestSourceAt: Date | null;
  expiresAt: Date;
};
