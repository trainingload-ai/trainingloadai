"use client";

import { Bike, Footprints, Waves, type LucideIcon } from "lucide-react";

export type NewUserDialogStep = 1 | 2 | 3;
export type PreferredSport = "CYCLING" | "RUN" | "SWIM" | "STRENGTH";

type TranslateFn = (key: string) => string;

export type NewUserSportOption = {
  desc?: string;
  icon: LucideIcon;
  label: string;
  value: PreferredSport;
};

export function parseEstimatedAge(age: string) {
  const numericAge = Number(age);
  return Number.isFinite(numericAge) && numericAge > 0 && numericAge < 120
    ? numericAge
    : undefined;
}

export function getEstimatedMaxHeartRate(age?: number) {
  if (age == null) return undefined;
  return Math.round(208 - 0.7 * age);
}

export function getEstimatedRestHeartRate(age?: number) {
  if (age == null) return undefined;
  if (age < 35) return 60;
  if (age < 50) return 65;
  return 70;
}

export function canProceedFromStep1(preferredSports: PreferredSport[]) {
  return preferredSports.length > 0;
}

export function canProceedFromStep2(args: {
  maxHR: string;
  restHR: string;
}) {
  const maxHeartRate = Number(args.maxHR);
  const restHeartRate = Number(args.restHR);
  if (!Number.isFinite(maxHeartRate) || !Number.isFinite(restHeartRate)) {
    return false;
  }
  if (maxHeartRate <= 0 || restHeartRate <= 0) return false;
  if (maxHeartRate < restHeartRate) return false;
  if (maxHeartRate < 80 || maxHeartRate > 240) return false;
  if (restHeartRate < 30 || restHeartRate > 120) return false;
  return true;
}

export function canFinishStep3(args: {
  cyclingFtp: string;
  runFtp: string;
  weight: string;
}) {
  const runFtp = args.runFtp ? Number(args.runFtp) : undefined;
  const cyclingFtp = args.cyclingFtp ? Number(args.cyclingFtp) : undefined;

  if (runFtp != null) {
    if (!Number.isFinite(runFtp) || runFtp <= 0) return false;
    if (runFtp < 50 || runFtp > 600) return false;
  }
  if (cyclingFtp != null) {
    if (!Number.isFinite(cyclingFtp) || cyclingFtp <= 0) return false;
    if (cyclingFtp < 50 || cyclingFtp > 600) return false;
  }

  const weight = args.weight ? Number(args.weight) : undefined;
  if (weight != null) {
    if (!Number.isFinite(weight) || weight <= 0 || weight > 250) return false;
  }

  return true;
}

export function getNewUserSportOptions(t: TranslateFn): NewUserSportOption[] {
  return [
    {
      value: "CYCLING",
      label: t("sportOptions.cycling"),
      icon: Bike,
    },
    {
      value: "RUN",
      label: t("sportOptions.run"),
      icon: Footprints,
    },
    {
      value: "SWIM",
      label: t("sportOptions.swim"),
      icon: Waves,
    },
  ];
}
