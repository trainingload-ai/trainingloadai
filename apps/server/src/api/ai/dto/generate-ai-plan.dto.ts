export type IntentType =
  | 'healthFatLoss'
  | 'fitnessBuild'
  | 'racePrep'
  | 'skillFocus'
  | 'returnToTraining';

export type SportType = 'run' | 'cycle' | 'swim' | 'strength';
export type RaceDiscipline = 'run' | 'tri' | 'cycle';
export type RaceDistanceKey =
  | '5k'
  | '10k'
  | 'half'
  | 'full'
  | 'sprint'
  | 'olympic'
  | 'halfIron'
  | 'fullIron'
  | 'criterium'
  | 'road';

export interface GenerateAiPlanDto {
  sportTypes: SportType[];
  intent: IntentType;
  raceDiscipline?: RaceDiscipline;
  raceDistance?: RaceDistanceKey;
  cycleWeeks: number;
  weeklyDays: number;
  dailyMinutes: number;
}
