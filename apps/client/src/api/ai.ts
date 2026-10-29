import { apiFetch } from "@/lib/api";
import { SportType } from "./activities";

export type IntentType =
  | "healthFatLoss"
  | "fitnessBuild"
  | "racePrep"
  | "skillFocus"
  | "returnToTraining";

export type RaceDiscipline = "run" | "tri" | "cycle";
export type RaceDistanceKey =
  | "5k"
  | "10k"
  | "half"
  | "full"
  | "sprint"
  | "olympic"
  | "halfIron"
  | "fullIron"
  | "criterium"
  | "road";

export interface GenerateAIPlanDto {
  sportTypes: SportType[];
  intent: IntentType;
  raceDiscipline?: RaceDiscipline;
  raceDistance?: RaceDistanceKey;
  cycleWeeks: number;
  weeklyDays: number;
  dailyMinutes: number;
}

export const generateAIPlan = async (payload: GenerateAIPlanDto) => {
  return apiFetch("/ai/generate-plan", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};
