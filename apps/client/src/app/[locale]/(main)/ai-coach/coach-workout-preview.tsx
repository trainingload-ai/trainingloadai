"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { parseWorkoutDefinition } from "@/api/workout";
import type { PlanSportType } from "@/api/plans";
import { WorkoutRenderer } from "@/components/workout/WorkoutRenderer";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkoutStructureKind } from "@shared/workout-structure";

/** Read-only canonical parser; identical previews share a request and cache. */
export function CoachWorkoutPreview({
  text,
  sportType,
  kind = "ENDURANCE",
}: {
  text: string;
  sportType: PlanSportType;
  kind?: WorkoutStructureKind;
}) {
  const t = useTranslations("AiCoachPage");
  const definition = useQuery({
    queryKey: ["coach-workout-preview", kind, text],
    queryFn: () =>
      parseWorkoutDefinition({ kind, version: 1, source: "TEXT", text }),
    enabled: Boolean(text.trim()),
    staleTime: Infinity,
    retry: false,
  });
  if (!text.trim()) return null;
  return (
    <div className="mt-3 min-w-0 space-y-2" data-coach-workout-preview>
      {definition.isPending ? (
        <Skeleton
          role="status"
          aria-label={t("rendering.rendering", { name: t("decision.workout") })}
          className="h-20 w-full rounded-md motion-reduce:animate-none"
        />
      ) : definition.data ? (
        <WorkoutRenderer
          workout={{
            sportType,
            text: definition.data.text,
            structureKind: definition.data.kind,
            structure: definition.data.structure,
            summary: definition.data.summary,
          }}
          density="COMPACT"
          chartHeight={80}
          className="overflow-hidden rounded-md"
        />
      ) : null}
      <details
        className="group text-xs text-muted-foreground"
        open={definition.isError || undefined}
      >
        <summary className="w-fit cursor-pointer rounded-sm py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t("decision.workoutText")}
        </summary>
        <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 font-mono text-xs leading-5 text-foreground">
          {text}
        </pre>
      </details>
    </div>
  );
}
