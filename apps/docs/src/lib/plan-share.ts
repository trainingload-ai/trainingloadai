import type { WorkoutStructure } from "@shared/workout-structure";
import { parseApiEnvelopeText } from "@shared/runtime-reliability";
import { localePrefix } from "@/lib/locale-url";

export const PLAN_SHARE_PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;

export type PublicPlanSharePreview = {
  publicId: string;
  lineagePublicId: string;
  slug?: string;
  origin: "USER_SHARE" | "OFFICIAL";
  visibility: "UNLISTED" | "CATALOG";
  version: number;
  title: string;
  description: string | null;
  goal: string | null;
  periodWeeks: number;
  locale: string;
  sportTypes: string[];
  workoutCount: number;
  trainingDaysPerWeek: number;
  workouts: Array<{
    weekIndex: number;
    dayIndex: number;
    sessionIndex: number;
    sportType: string;
    name: string | null;
    notes: string | null;
    structureKind: string;
    structure?: WorkoutStructure;
    durationSeconds?: number | null;
    previewLoad?: number | null;
  }>;
};

export class PlanSharePreviewError extends Error {
  constructor(readonly status: number) {
    super(`plan share preview failed: ${status}`);
    this.name = "PlanSharePreviewError";
  }
}

export function isPlanSharePublicId(value: string) {
  return PLAN_SHARE_PUBLIC_ID_PATTERN.test(value);
}

export function appOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.trainingload.ai"
  ).replace(/\/+$/, "");
}

export function planShareImportUrl(locale: string, publicId: string) {
  const prefix = localePrefix(locale) || "/en";
  return `${appOrigin()}${prefix}/plans/import/share/${encodeURIComponent(publicId)}?from=docs-plan-share`;
}

function unwrapPreview(raw: string): PublicPlanSharePreview | null {
  const envelope = parseApiEnvelopeText<PublicPlanSharePreview>(raw);
  const data = envelope?.data;
  if (!data || typeof data !== "object") return null;
  if (typeof data.publicId !== "string" || typeof data.title !== "string") {
    return null;
  }
  if (!Array.isArray(data.workouts)) return null;
  return data;
}

export { unwrapPreview as unwrapPlanSharePreview };
