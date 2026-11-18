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

export type AssessmentEvidence = {
  snapshot: { asOf: string; timezone: string };
  evidenceHash: string;
  latestSourceAt: Date | null;
  expiresAt: Date;
};
