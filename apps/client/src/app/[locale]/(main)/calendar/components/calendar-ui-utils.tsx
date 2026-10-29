"use client";

import { Link as LinkIcon, Waves, FlameKindling } from "lucide-react";
import type { SportType } from "@/api/activities";
import type { PlanWorkout } from "@/api/plans";

export function getCalendarSportSurfaceClass(type?: string) {
  switch ((type as SportType) || "UNKNOWN") {
    case "RUN":
      return "bg-[hsl(var(--rose-50))] text-[hsl(var(--rose-800))] border border-[hsl(var(--rose-200))] dark:bg-[hsl(var(--rose-950))]/40 dark:text-[hsl(var(--rose-200))] dark:border-[hsl(var(--rose-900))]";
    case "CYCLING":
      return "bg-[hsl(var(--lime-50))] text-[hsl(var(--lime-800))] border border-[hsl(var(--lime-200))] dark:bg-[hsl(var(--lime-950))]/40 dark:text-[hsl(var(--lime-200))] dark:border-[hsl(var(--lime-900))]";
    case "SWIM":
      return "bg-[hsl(var(--indigo-50))] text-[hsl(var(--indigo-800))] border border-[hsl(var(--indigo-200))] dark:bg-[hsl(var(--indigo-950))]/40 dark:text-[hsl(var(--indigo-200))] dark:border-[hsl(var(--indigo-900))]";
    default:
      return "bg-[hsl(var(--slate-100))] text-[hsl(var(--slate-700))] border border-[hsl(var(--slate-200))] dark:bg-[hsl(var(--slate-900))] dark:text-[hsl(var(--slate-200))] dark:border-[hsl(var(--slate-800))]";
  }
}

export function getCalendarSportAccentClass(type?: string) {
  switch ((type as SportType) || "UNKNOWN") {
    case "RUN":
      return "bg-[hsl(var(--rose-500))]";
    case "CYCLING":
      return "bg-[hsl(var(--lime-500))]";
    case "SWIM":
      return "bg-[hsl(var(--indigo-500))]";
    default:
      return "bg-[hsl(var(--slate-400))]";
  }
}

export function getCalendarSportTintClass(type?: string) {
  switch ((type as SportType) || "UNKNOWN") {
    case "RUN":
      return "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200";
    case "CYCLING":
      return "bg-lime-50 text-lime-700 dark:bg-lime-950/30 dark:text-lime-200";
    case "SWIM":
      return "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-200";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200";
  }
}

export function getCalendarSportLabel(type?: string) {
  switch ((type as SportType) || "UNKNOWN") {
    case "RUN":
      return "Run";
    case "CYCLING":
      return "Ride";
    case "SWIM":
      return "Swim";
    default:
      return "Other";
  }
}

export function getCalendarItemTitle(item: PlanWorkout) {
  return item.notes?.trim() || item.name?.trim() || item.text?.trim() || "Plan";
}

export function getCalendarItemLeadingIcon(type?: string) {
  switch ((type as SportType) || "UNKNOWN") {
    case "RUN":
      return FlameKindling;
    case "CYCLING":
      return LinkIcon;
    case "SWIM":
      return Waves;
    default:
      return FlameKindling;
  }
}
