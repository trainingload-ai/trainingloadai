import type {
  CompetitionEventSource,
  CompetitionGoalType,
  CompetitionImportance,
  SportType,
} from '@prisma/client';

export type CompetitionEventMutationActor =
  | 'USER'
  | 'AI_CONFIRMED'
  | 'IMPORT'
  | 'SYSTEM';

export type CompetitionEventWriteInput = {
  title: string;
  sportType: SportType;
  sportDefinitionCode?: string | null;
  distanceMeters?: number | null;
  startDate: string;
  endDate?: string | null;
  startTimeMinute?: number | null;
  timezone?: string | null;
  importance: CompetitionImportance;
  goalType: CompetitionGoalType;
  targetTimeSeconds?: number | null;
  location?: string | null;
  notes?: string | null;
};

export type CreateCompetitionEventArgs = {
  input: CompetitionEventWriteInput;
  source: CompetitionEventSource;
  actorType: CompetitionEventMutationActor;
  idempotencyKey?: string | null;
  requestId?: string | null;
};
