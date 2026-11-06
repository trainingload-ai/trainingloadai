import type {
  BodyMetricType,
  MetricSource,
  SportType,
  UserFitnessMetricType,
  ZoneType,
} from '@prisma/client';
import type { UserProfileResponse } from '@/api/user/user.interface';
import type { UserZoneSetting } from '@/utils/zones';
import type { ResolvedAnalysisConfig } from '@/api/user/user-analysis-config.service';
import type { ActivityInputFingerprints } from './activity-input-fingerprint.service';

export const FITNESS_CONTEXT_RESOLUTION_VERSION = 5;

export type ResolvedFitnessMetricValue = {
  value: number | null;
  value2: number | null;
  source: MetricSource | 'ACTIVITY_BOOTSTRAP' | 'DEFAULT' | 'UNAVAILABLE';
  effectiveAt: Date | null;
  sourceMetricId?: string | null;
  evidenceFingerprint: string;
  reason?: string | null;
};

export type ResolvedZoneVersion = {
  zoneType: ZoneType;
  sport: SportType;
  versionId: string | null;
  effectiveAt: Date | null;
  calculationFingerprint: string;
  provenanceFingerprint: string;
  setting: UserZoneSetting;
};

export type ResolvedBodyMetricValue = {
  type: BodyMetricType;
  value: string | null;
  effectiveAt: Date | null;
  sourceId: string | null;
  evidenceFingerprint: string;
  reason?: string | null;
};

export type ResolvedFitnessContext = {
  resolutionVersion: typeof FITNESS_CONTEXT_RESOLUTION_VERSION;
  activityId: number;
  activityStart: Date;
  activityEnd: Date;
  sport: SportType;
  profile: UserProfileResponse;
  analysisConfig: ResolvedAnalysisConfig;
  inputFingerprints: ActivityInputFingerprints;
  metrics: Partial<Record<UserFitnessMetricType, ResolvedFitnessMetricValue>>;
  zones: readonly ResolvedZoneVersion[];
  bodyMetrics: readonly ResolvedBodyMetricValue[];
  contextFingerprint: string;
  calculationFingerprint: string;
  provenanceFingerprint: string;
};

export type UnfingerprintedFitnessContext = Omit<
  ResolvedFitnessContext,
  'contextFingerprint' | 'calculationFingerprint' | 'provenanceFingerprint'
>;
