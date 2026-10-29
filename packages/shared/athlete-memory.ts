export type AthleteMemoryPreference = {
  available: boolean;
  enabled: boolean;
  effectiveEnabled: boolean;
  updatedAt: string | null;
  consentRequired: boolean;
};

export type AthleteMemoryEvidenceSummary = {
  id: string;
  assertedAt: string;
  createdAt: string;
};

export type AthleteMemoryFact = {
  id: string;
  kind: string;
  category: string;
  claim: string;
  status: string;
  epistemicStatus: string;
  confidence: number;
  eventStart: string | null;
  eventEnd: string | null;
  timeText: string | null;
  timePrecision: string;
  timezone: string;
  validFrom: string | null;
  validUntil: string | null;
  decayProfile: string;
  reviewAfter: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  evidence?: AthleteMemoryEvidenceSummary[];
};

export type AthleteMemoryPage = {
  items: AthleteMemoryFact[];
  nextCursor: string | null;
};

export const ATHLETE_MEMORY_CATEGORIES = [
  "sleep_quality",
  "sleep_duration",
  "fatigue",
  "recovery",
  "pain",
  "illness",
  "stress",
  "mood",
  "schedule_constraint",
  "travel",
  "equipment_constraint",
  "training_preference",
  "communication_preference",
  "goal",
  "race_goal",
  "nutrition",
  "hydration",
  "subjective_effort",
  "general_context",
] as const;
