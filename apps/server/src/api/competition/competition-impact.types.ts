import type { CompetitionAssessmentScopeType } from './dto/resolve-competition-impact.dto';
import type { SupportedAppLocale } from '@/utils/locale.util';
import type { AiUsageKind } from '@prisma/client';

export const COMPETITION_IMPACT_LEVELS = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const;
export type CompetitionImpactLevel = (typeof COMPETITION_IMPACT_LEVELS)[number];

export const COMPETITION_IMPACT_PHASE_TYPES = [
  'GENERAL_PREPARATION',
  'SPECIFIC_PREPARATION',
  'PEAK',
  'TAPER',
  'EVENT',
  'RECOVERY',
] as const;
export type CompetitionImpactPhaseType =
  (typeof COMPETITION_IMPACT_PHASE_TYPES)[number];

export const COMPETITION_IMPACT_CONSTRAINT_TYPES = [
  'BUILD_GENERAL_CAPACITY',
  'BUILD_EVENT_SPECIFICITY',
  'PRESERVE_INTENSITY',
  'REDUCE_VOLUME',
  'LIMIT_INTENSITY_DENSITY',
  'PROTECT_KEY_SESSION_SPACING',
  'AVOID_LATE_MAKEUP_SESSION',
  'PROTECT_EVENT_DAY',
  'POST_EVENT_RECOVERY',
  'MONITOR_FATIGUE',
  'RESOLVE_EVENT_CONFLICT',
  'INSUFFICIENT_PREPARATION_TIME',
] as const;
export type CompetitionImpactConstraintType =
  (typeof COMPETITION_IMPACT_CONSTRAINT_TYPES)[number];

export type CompetitionImpactInputEvent = {
  id: string;
  version: number;
  title: string;
  sportType: string;
  sportDefinitionCode: string | null;
  distanceMeters: number | null;
  startDate: string;
  endDate: string | null;
  importance: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  goalType: string;
  targetTimeSeconds: number | null;
};

export type CompetitionImpactInput = {
  schemaVersion: 1;
  locale: SupportedAppLocale;
  anchorDate: string;
  scope: {
    type: CompetitionAssessmentScopeType;
    startDate: string;
    endDate: string;
    subjectSummary?: Record<string, unknown> | null;
  };
  candidateSelection: {
    startDate: string;
    endDate: string;
    truncated: boolean;
    totalBeforeLimit: number;
  };
  events: CompetitionImpactInputEvent[];
  athlete: {
    personalizationReadiness: 'none' | 'sparse' | 'adequate';
    averageWeek: {
      activityCount: number;
      activeDays: number;
      totalDurationMin: number;
      totalDistanceKm: number;
      totalLoad: number;
    };
    longestSession: {
      sportType: string | null;
      durationMin: number;
      distanceKm: number;
      date: string | null;
    } | null;
    recentLoad: {
      ctl: number | null;
      atl: number | null;
      tsb: number | null;
      dailyLoadLast7d: number[];
    };
    dataFreshness: {
      latestActivityAt: string | null;
      latestPmcDate: string | null;
    };
  };
};

export type CompetitionImpactPhase = {
  type: CompetitionImpactPhaseType;
  startDate: string;
  endDate: string;
  impactLevel: CompetitionImpactLevel;
};

export type CompetitionImpactConstraint = {
  type: CompetitionImpactConstraintType;
  startDate: string;
  endDate: string;
  strength: CompetitionImpactLevel;
  parameters: Record<string, string | number | boolean | null>;
};

export type CompetitionEventImpactAssessment = {
  eventId: string;
  relevant: boolean;
  confidence: number;
  currentImpactLevel: CompetitionImpactLevel;
  influenceWindow: {
    startDate: string;
    endDate: string;
    preEventWeeks: number;
    postEventWeeks: number;
  } | null;
  phases: CompetitionImpactPhase[];
  constraints: CompetitionImpactConstraint[];
  reasoningSummary: string;
  evidence: string[];
  assumptions: string[];
  riskFlags: string[];
};

export type CompetitionImpactResult = {
  schemaVersion: 1;
  assessmentDate: string;
  eventAssessments: CompetitionEventImpactAssessment[];
  combinedImpact: {
    overallLevel: CompetitionImpactLevel;
    conflicts: Array<{
      eventIds: string[];
      type: string;
      severity: CompetitionImpactLevel;
      summary: string;
    }>;
    strategySummary: string;
  };
};

export type ResolveCompetitionImpactArgs = {
  userId: string;
  aiOperationId?: string | null;
  aiUsageKind?: AiUsageKind;
  scopeType: CompetitionAssessmentScopeType;
  scopeStartDate: string;
  scopeEndDate: string;
  anchorDate: string;
  subjectSummary?: Record<string, unknown> | null;
  locale?: SupportedAppLocale;
  forceRefresh?: boolean;
};
