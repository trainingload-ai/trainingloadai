"use client";

import { CalendarClock, Link2, SkipForward, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { PlanWorkout } from "@/api/plans";
import { PlanWorkoutActivityLinkControl } from "@/components/plan/plan-workout-activity-link-control";
import {
  buildWorkoutListTitle,
  canMutatePlanWorkoutSchedule,
  formatSportTypeLabel,
  getPlanWorkoutDisplayKind,
  getPlanWorkoutMovedByLabel,
  getPlanWorkoutStatusLabel,
  getWeekWorkoutStatusLabelClass,
} from "@/components/plan/detail/plan-detail-utils";
import {
  buildMobileWorkoutSegments,
  type MobileWorkoutSegment,
} from "@/components/plan/mobile-plan-workout-row";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { WorkoutActionConfirm } from "@/components/plan/workout-action-confirm";
import { formatWorkoutDuration } from "@/lib/workout-display-utils";
import { cn } from "@/lib/utils";
import { getLocalizedActivityTitle } from "@/lib/activity-title";

type PendingConfirmation = "postpone" | "skip" | null;

function workoutAccentColor(sportType: PlanWorkout["sportType"]) {
  if (sportType === "CYCLING") return "#f97316";
  if (sportType === "SWIM") return "#06b6d4";
  if (sportType === "RUN") return "#10b981";
  return "#8b5cf6";
}

function formatChartTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function segmentCoordinates(segments: MobileWorkoutSegment[]) {
  const width = 320;
  const top = 12;
  const bottom = 26;
  const side = 8;
  const plotWidth = width - side * 2;
  const plotHeight = 124 - top - bottom;
  const total =
    segments.reduce((sum, segment) => sum + Math.max(1, segment.duration), 0) ||
    1;
  let elapsed = 0;
  return segments.map((segment) => {
    const start = elapsed;
    elapsed += Math.max(1, segment.duration);
    return {
      ...segment,
      x0: side + (start / total) * plotWidth,
      x1: side + (elapsed / total) * plotWidth,
      y: top + ((100 - segment.intensity) / 100) * plotHeight,
    };
  });
}

function WorkoutStructureChart({ workout }: { workout: PlanWorkout }) {
  const t = useTranslations("ViewWorkoutDialog.mobile");
  const segments = useMemo(
    () => buildMobileWorkoutSegments(workout),
    [workout],
  );
  const coordinates = useMemo(() => segmentCoordinates(segments), [segments]);
  const totalDuration = segments.reduce(
    (sum, segment) => sum + Math.max(1, segment.duration),
    0,
  );
  if (segments.length === 0) return null;
  const linePoints = coordinates.flatMap((segment) => [
    `${segment.x0},${segment.y}`,
    `${segment.x1},${segment.y}`,
  ]);

  return (
    <DetailSection title={t("workoutChartLabel")}>
      <div className="overflow-hidden rounded-surface bg-muted/60">
        <svg
          className="h-[124px] w-full"
          viewBox="0 0 320 124"
          preserveAspectRatio="none"
          role="img"
          aria-label={t("workoutChartLabel")}
        >
          {[16, 48, 80].map((y) => (
            <line
              key={y}
              x1="8"
              x2="312"
              y1={y}
              y2={y}
              className="stroke-zinc-300 dark:stroke-zinc-700"
              strokeDasharray="3 3"
            />
          ))}
          {coordinates.map((segment, index) => (
            <rect
              key={`${index}-${segment.x0}`}
              x={segment.x0}
              y={segment.y}
              width={Math.max(2, segment.x1 - segment.x0)}
              height={98 - segment.y}
              fill={segment.color}
              opacity="0.5"
            />
          ))}
          <polyline
            points={linePoints.join(" ")}
            fill="none"
            stroke={workoutAccentColor(workout.sportType)}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <text x="8" y="116" fontSize="10" className="fill-muted-foreground">
            0:00
          </text>
          <text
            x="312"
            y="116"
            textAnchor="end"
            fontSize="10"
            className="fill-muted-foreground"
          >
            {formatChartTime(totalDuration)}
          </text>
        </svg>
      </div>
    </DetailSection>
  );
}

function DetailSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function HighlightedWorkoutText({ text }: { text: string }) {
  const tokens = text.split(
    /(\b(?:warmup|cooldown|repeat|rest|recovery|work|pace|power|hr|cadence|z[1-7])\b|\d+(?:\.\d+)?(?:km|m|min|sec|s|h|w|bpm|rpm|%))/gi,
  );
  return (
    <p className="whitespace-pre-wrap rounded-control-lg bg-muted/60 px-3 py-2 text-base leading-6 text-foreground/80">
      {tokens.map((token, index) => {
        const highlighted =
          /\b(?:warmup|cooldown|repeat|rest|recovery|work|pace|power|hr|cadence|z[1-7])\b/i.test(
            token,
          ) || /\d+(?:\.\d+)?(?:km|m|min|sec|s|h|w|bpm|rpm|%)/i.test(token);
        return highlighted ? (
          <strong
            key={`${token}-${index}`}
            className="font-semibold text-foreground"
          >
            {token}
          </strong>
        ) : (
          token
        );
      })}
    </p>
  );
}

function WorkoutStructure({ workout }: { workout: PlanWorkout }) {
  const t = useTranslations("ViewWorkoutDialog.mobile");
  if (workout.structure.kind === "STRENGTH") {
    return (
      <DetailSection title={t("workoutStructureLabel")}>
        <div className="space-y-2">
          {workout.structure.exercises.map((exercise, index) => (
            <div
              key={exercise.id ?? `${exercise.name}-${index}`}
              className="rounded-control-lg bg-muted/60 px-3 py-2.5"
            >
              <div className="text-base font-semibold text-foreground">
                {exercise.name || t("exerciseFallback", { index: index + 1 })}
              </div>
              {exercise.equipmentCode ? (
                <div className="mt-1 text-mobile-caption text-muted-foreground pc:text-xs">
                  {exercise.equipmentCode}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </DetailSection>
    );
  }
  return (
    <DetailSection title={t("workoutStructureLabel")}>
      <HighlightedWorkoutText text={workout.text || t("noData")} />
    </DetailSection>
  );
}

function InlineAction({
  children,
  disabled,
  onClick,
  tone = "default",
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium active:bg-neutral-100 disabled:opacity-45 dark:active:bg-zinc-900",
        tone === "danger"
          ? "text-red-600 dark:text-red-300"
          : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function MobileViewWorkoutContent({
  loading,
  onPostpone,
  actions,
  onSkip,
  pending,
  workout,
}: {
  loading: boolean;
  onPostpone: () => Promise<void>;
  actions?: ReactNode;
  onSkip: () => Promise<void>;
  pending: boolean;
  workout: PlanWorkout | null;
}) {
  const t = useTranslations("ViewWorkoutDialog.mobile");
  const detailT = useTranslations("V2PlanDetailPage");
  const tActivityTitle = useTranslations("ActivityTitle");
  const [confirmation, setConfirmation] = useState<PendingConfirmation>(null);
  const primaryLink = workout?.links?.find(
    (link) => link.role === "PRIMARY" && !link.unlinkedAt,
  );
  const canMutate = workout ? canMutatePlanWorkoutSchedule(workout) : false;
  const displayKind = workout
    ? getPlanWorkoutDisplayKind({
        status: workout.status,
        scheduledDate: workout.scheduledDate,
      })
    : "upcoming";
  const sport = workout ? formatSportTypeLabel(detailT, workout.sportType) : "";
  const duration = workout
    ? formatWorkoutDuration(workout.summary.durationSeconds)
    : "";
  const statusLabel = workout
    ? getPlanWorkoutStatusLabel(detailT, displayKind)
    : "";
  const movedByLabel = workout
    ? getPlanWorkoutMovedByLabel(detailT, workout.movedBy)
    : null;

  const runConfirmedAction = async () => {
    if (!confirmation) return;
    if (confirmation === "postpone") await onPostpone();
    else await onSkip();
    setConfirmation(null);
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col bg-neutral-50 dark:bg-[#202221]">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-safe-or-3 py-4">
          {loading && !workout ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t("loading")}
            </div>
          ) : workout ? (
            <div className="space-y-4 px-1">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-muted-foreground">
                    {t("workoutDetailMeta")}
                  </div>
                  <div className="mt-1 text-base text-foreground/75">
                    {[sport, duration !== "--" ? duration : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-mobile-caption font-semibold pc:text-xs",
                    getWeekWorkoutStatusLabelClass(displayKind),
                  )}
                >
                  {statusLabel}
                </span>
              </div>

              <WorkoutStructureChart workout={workout} />

              {workout.notes?.trim() ? (
                <DetailSection title={t("workoutDescriptionLabel")}>
                  <p className="whitespace-pre-wrap text-base leading-6 text-foreground/80">
                    {workout.notes.trim()}
                  </p>
                </DetailSection>
              ) : null}

              <WorkoutStructure workout={workout} />

              <div className="flex items-center gap-1.5 border-t border-border pt-3 text-sm text-muted-foreground">
                <Link2 className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  {primaryLink?.activity?.title
                    ? t("linked", {
                        activity: getLocalizedActivityTitle(
                          primaryLink.activity,
                          tActivityTitle,
                        ),
                      })
                    : t("notLinked")}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {workout ? (
          <div className="shrink-0 space-y-2 border-t border-border/60 bg-background px-safe-or-3 pb-safe-or-3 pt-3 dark:bg-[#202221]">
            {displayKind === "moved" ? (
              movedByLabel ? (
                <div className="text-center text-mobile-caption text-muted-foreground pc:text-xs">
                  {movedByLabel}
                </div>
              ) : null
            ) : (
              <PlanWorkoutActivityLinkControl
                workoutId={workout.id}
                sportType={workout.sportType}
                scheduledDateKey={workout.scheduledDate?.slice(0, 10) ?? null}
                links={workout.links}
                mobileAction
              />
            )}
            {actions ??
              (canMutate ? (
                <div className="flex items-center justify-center gap-2">
                  <InlineAction
                    disabled={pending}
                    onClick={() => setConfirmation("postpone")}
                  >
                    <CalendarClock className="size-4" aria-hidden="true" />
                    {t("postpone")}
                  </InlineAction>
                  <div className="h-5 w-px bg-border" />
                  <InlineAction
                    disabled={pending}
                    onClick={() => setConfirmation("skip")}
                    tone="danger"
                  >
                    <SkipForward className="size-4" aria-hidden="true" />
                    {t("skip")}
                  </InlineAction>
                </div>
              ) : null)}
          </div>
        ) : null}
      </div>

      <WorkoutActionConfirm
        open={confirmation !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !pending) setConfirmation(null);
        }}
        title={
          confirmation === "postpone"
            ? t("confirmPostponeTitle")
            : t("confirmSkipTitle")
        }
        description={
          confirmation === "postpone"
            ? t("confirmPostponeMessage")
            : t("confirmSkipMessage")
        }
        cancelLabel={t("cancel")}
        confirmLabel={
          pending
            ? t("pending")
            : confirmation === "postpone"
              ? t("postpone")
              : t("skip")
        }
        pending={pending}
        destructive={confirmation === "skip"}
        onConfirm={runConfirmedAction}
      />
    </>
  );
}

export function MobileViewWorkoutDialog({
  loading,
  onOpenChange,
  onPostpone,
  actions,
  onSkip,
  open,
  pending,
  workout,
}: {
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onPostpone: () => Promise<void>;
  actions?: ReactNode;
  onSkip: () => Promise<void>;
  open: boolean;
  pending: boolean;
  workout: PlanWorkout | null;
}) {
  const t = useTranslations("ViewWorkoutDialog.mobile");
  const tShared = useTranslations("SharedUI");
  const detailT = useTranslations("V2PlanDetailPage");
  const title = workout
    ? buildWorkoutListTitle(detailT, workout)
    : t("plannedWorkout");
  const sport = workout ? formatSportTypeLabel(detailT, workout.sportType) : "";
  const duration = workout
    ? formatWorkoutDuration(workout.summary.durationSeconds)
    : "";

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
    >
      <DrawerContent className="flex h-[96dvh] max-h-[96dvh] flex-col gap-0 overflow-hidden rounded-t-2xl bg-neutral-50 p-0 pb-0 dark:bg-[#202221]">
        <div
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-black/15 dark:bg-white/20"
        />
        <DrawerHeader className="relative shrink-0 border-b border-border/60 px-4 pb-3 pt-2 text-left dark:bg-[#202221]">
          <div className="min-w-0 pr-14">
            <DrawerTitle className="truncate text-[17px] leading-6">
              {title}
            </DrawerTitle>
            <DrawerDescription className="mt-0.5 truncate text-[13px] leading-[18px] text-muted-foreground">
              {[sport, duration !== "--" ? duration : null]
                .filter(Boolean)
                .join(" · ")}
            </DrawerDescription>
          </div>
          <DrawerClose asChild>
            <button
              type="button"
              aria-label={tShared("close")}
              className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/70 text-zinc-900 shadow-sm ring-1 ring-black/5 backdrop-blur-xl transition hover:bg-white/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-white/10 dark:text-zinc-50 dark:ring-white/10 dark:hover:bg-white/15"
            >
              <X className="size-[18px]" aria-hidden="true" />
            </button>
          </DrawerClose>
        </DrawerHeader>
        <MobileViewWorkoutContent
          loading={loading}
          pending={pending}
          workout={workout}
          actions={actions}
          onPostpone={onPostpone}
          onSkip={onSkip}
        />
      </DrawerContent>
    </Drawer>
  );
}
