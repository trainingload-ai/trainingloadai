"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  cancelCompetitionEvent,
  createCompetitionEvent,
  deleteCompetitionEvent,
  getCurrentCompetitionImpact,
  restoreCompetitionEvent,
  updateCompetitionEvent,
  type CompetitionEvent,
  type CompetitionEventImpactAssessment,
  type CompetitionEventWriteInput,
  type CompetitionGoalType,
  type CompetitionImpactResponse,
  type CompetitionImportance,
} from "@/api/competition-events";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "@/components/ui/adaptive-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiFetchError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import {
  CompetitionSportPicker,
  CompetitionTimePicker,
} from "./competition-form-controls";

const IMPORTANCE: CompetitionImportance[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];
const GOALS: CompetitionGoalType[] = [
  "FINISH",
  "TARGET_TIME",
  "PERFORMANCE",
  "EXPERIENCE",
];

type FormState = {
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  sportType: CompetitionEvent["sportType"];
  distanceKm: string;
  importance: CompetitionImportance;
  goalType: CompetitionGoalType;
  targetHours: string;
  targetMinutes: string;
  location: string;
  notes: string;
};

function formFromEvent(
  event: CompetitionEvent | null,
  defaultDate: string,
): FormState {
  const totalSeconds = event?.targetTimeSeconds ?? 0;
  return {
    title: event?.title ?? "",
    startDate: event?.startDate ?? defaultDate,
    endDate: event?.endDate ?? "",
    startTime:
      event?.startTimeMinute != null
        ? `${String(Math.floor(event.startTimeMinute / 60)).padStart(2, "0")}:${String(event.startTimeMinute % 60).padStart(2, "0")}`
        : "",
    sportType: event?.sportType ?? "RUN",
    distanceKm: event?.distanceMeters
      ? String(event.distanceMeters / 1000)
      : "",
    importance: event?.importance ?? "HIGH",
    goalType: event?.goalType ?? "FINISH",
    targetHours: event?.targetTimeSeconds
      ? String(Math.floor(totalSeconds / 3600))
      : "",
    targetMinutes: event?.targetTimeSeconds
      ? String(Math.floor((totalSeconds % 3600) / 60))
      : "",
    location: event?.location ?? "",
    notes: event?.notes ?? "",
  };
}

function idempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `competition-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localTodayYmd() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseLocalYmd(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toLocalYmd(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function DetailItem({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md bg-neutral-100 px-3 py-2.5 dark:bg-muted/45",
        className,
      )}
    >
      <dt className="text-mobile-caption pc:text-xs text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium">{children}</dd>
    </div>
  );
}

function CompetitionImpactSummary({
  className,
  eventImpact,
  impactResponse,
  isError,
  isPending,
}: {
  className?: string;
  eventImpact?: CompetitionEventImpactAssessment;
  impactResponse?: CompetitionImpactResponse;
  isError: boolean;
  isPending: boolean;
}) {
  const t = useTranslations("CompetitionEvents");
  const locale = useLocale();
  const isFallback = impactResponse?.status === "FALLBACK";
  const confidence = eventImpact?.confidence ?? impactResponse?.confidence ?? 0;
  const impactLevel =
    eventImpact?.currentImpactLevel ??
    impactResponse?.result.combinedImpact.overallLevel;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  });
  const formatYmd = (value: string) => {
    const date = parseLocalYmd(value);
    return date ? dateFormatter.format(date) : value;
  };
  const summary =
    eventImpact?.relevant === false
      ? t(isFallback ? "impact.fallbackNotRelevant" : "impact.notRelevant")
      : isFallback
        ? t("impact.fallbackSummary")
        : eventImpact?.reasoningSummary ||
          impactResponse?.result.combinedImpact.strategySummary;

  return (
    <section className={cn("border-t border-border pt-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold">{t("impact.title")}</h3>
        {impactResponse ? (
          <span className="text-mobile-caption text-muted-foreground pc:text-xs">
            {isFallback ? t("impact.fallbackLabel") : t("impact.automatic")}
          </span>
        ) : null}
      </div>

      {isPending ? (
        <p
          aria-live="polite"
          className="mt-2 text-mobile-caption text-muted-foreground pc:text-xs"
        >
          {t("impact.loading")}
        </p>
      ) : isError || !impactResponse ? (
        <p className="mt-2 text-mobile-caption leading-5 text-muted-foreground pc:text-xs">
          {t("impact.unavailable")}
        </p>
      ) : (
        <div className="mt-3 rounded-md bg-neutral-100 px-3 py-3 dark:bg-muted/45">
          <p className="break-words text-sm leading-6">
            {summary || t("impact.unavailable")}
          </p>

          {impactLevel || eventImpact?.influenceWindow || confidence > 0 ? (
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-border/70 pt-3">
              {impactLevel ? (
                <div>
                  <dt className="text-mobile-caption text-muted-foreground pc:text-xs">
                    {t("impact.currentLevel")}
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium">
                    {t(`importance.${impactLevel}.label`)}
                  </dd>
                </div>
              ) : null}
              {eventImpact?.influenceWindow ? (
                <div>
                  <dt className="text-mobile-caption text-muted-foreground pc:text-xs">
                    {t("impact.window")}
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium">
                    {formatYmd(eventImpact.influenceWindow.startDate)} –{" "}
                    {formatYmd(eventImpact.influenceWindow.endDate)}
                  </dd>
                </div>
              ) : null}
              {!isFallback && confidence > 0 ? (
                <div>
                  <dt className="text-mobile-caption text-muted-foreground pc:text-xs">
                    {t("impact.confidenceLabel")}
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium">
                    {Math.round(confidence * 100)}%
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function CompetitionEventDetails({
  event,
  impactEnabled = true,
}: {
  event: CompetitionEvent;
  impactEnabled?: boolean;
}) {
  const t = useTranslations("CompetitionEvents");
  const locale = useLocale();
  const impactQuery = useQuery({
    queryKey: queryKeys.competitionImpact.current(
      "CALENDAR_RANGE",
      event.startDate,
      event.endDate || event.startDate,
      localTodayYmd(),
      locale,
    ),
    queryFn: () =>
      getCurrentCompetitionImpact({
        scopeType: "CALENDAR_RANGE",
        scopeStartDate: event.startDate,
        scopeEndDate: event.endDate || event.startDate,
        anchorDate: localTodayYmd(),
        locale,
      }),
    enabled: impactEnabled,
    staleTime: 60_000,
    retry: false,
  });
  const impactResponse = impactQuery.data;
  const eventImpact = impactResponse?.result.eventAssessments.find(
    (assessment) => assessment.eventId === event.id,
  );
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  });
  const formatYmd = (value: string) => {
    const date = parseLocalYmd(value);
    return date ? dateFormatter.format(date) : "—";
  };
  const dateRangeLabel = event.endDate
    ? `${formatYmd(event.startDate)} – ${formatYmd(event.endDate)}`
    : formatYmd(event.startDate);
  const timeLabel =
    event.startTimeMinute != null
      ? `${String(Math.floor(event.startTimeMinute / 60)).padStart(2, "0")}:${String(event.startTimeMinute % 60).padStart(2, "0")}`
      : t("details.allDay");
  const targetTimeLabel = event.targetTimeSeconds
    ? `${Math.floor(event.targetTimeSeconds / 3600)}:${String(Math.floor((event.targetTimeSeconds % 3600) / 60)).padStart(2, "0")}`
    : "—";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{event.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(`sports.${event.sportType}`)} · {dateRangeLabel}
        </p>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        <DetailItem label={t("form.dateRange")}>{dateRangeLabel}</DetailItem>
        <DetailItem label={t("form.startTime")}>{timeLabel}</DetailItem>
        <DetailItem label={t("form.sport")}>
          {t(`sports.${event.sportType}`)}
        </DetailItem>
        <DetailItem label={t("form.distance")}>
          {event.distanceMeters
            ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(event.distanceMeters / 1000)} km`
            : "—"}
        </DetailItem>
        <DetailItem label={t("form.importance")}>
          <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            {t(`importance.${event.importance}.label`)}
          </span>
        </DetailItem>
        <DetailItem label={t("form.goal")}>
          {t(`goals.${event.goalType}`)}
        </DetailItem>
        {event.goalType === "TARGET_TIME" ? (
          <DetailItem label={t("form.targetTime")}>
            {targetTimeLabel}
          </DetailItem>
        ) : null}
        <DetailItem label={t("form.location")}>
          {event.location || "—"}
        </DetailItem>
        <DetailItem label={t("form.notes")} className="sm:col-span-2">
          <span className="whitespace-pre-wrap font-normal">
            {event.notes || "—"}
          </span>
        </DetailItem>
      </dl>

      {impactEnabled ? (
        <CompetitionImpactSummary
          eventImpact={eventImpact}
          impactResponse={impactResponse}
          isError={impactQuery.isError}
          isPending={impactQuery.isPending}
        />
      ) : null}
    </div>
  );
}

export function CompetitionEventDialog({
  defaultDate,
  event,
  initialMode = "view",
  onOpenChange,
  open,
}: {
  defaultDate: string;
  event: CompetitionEvent | null;
  initialMode?: "view" | "edit";
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const t = useTranslations("CompetitionEvents");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const titleRef = React.useRef<HTMLInputElement>(null);
  const createKeyRef = React.useRef(idempotencyKey());
  const [form, setForm] = React.useState<FormState>(() =>
    formFromEvent(event, defaultDate),
  );
  const [formError, setFormError] = React.useState<string | null>(null);
  const [conflictLatest, setConflictLatest] =
    React.useState<CompetitionEvent | null>(null);
  const [workingVersion, setWorkingVersion] = React.useState(
    event?.version ?? null,
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"view" | "edit">(
    event ? initialMode : "edit",
  );

  React.useEffect(() => {
    if (!open) return;
    setForm(formFromEvent(event, defaultDate));
    setFormError(null);
    setConflictLatest(null);
    setWorkingVersion(event?.version ?? null);
    setMode(event ? initialMode : "edit");
    createKeyRef.current = idempotencyKey();
  }, [defaultDate, event, initialMode, open]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormError(null);
  };
  const invalidate = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.competitionEvents.all(),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.competitionImpact.all(),
      }),
    ]);
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const distanceKm = Number(form.distanceKm);
      const targetHours = Number(form.targetHours || 0);
      const targetMinutes = Number(form.targetMinutes || 0);
      const [startHour, startMinute] = form.startTime
        ? form.startTime.split(":").map(Number)
        : [null, null];
      const payload: CompetitionEventWriteInput = {
        title: form.title.trim(),
        startDate: form.startDate,
        endDate: form.endDate || null,
        startTimeMinute:
          startHour != null && startMinute != null
            ? startHour * 60 + startMinute
            : null,
        timezone: form.startTime
          ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
          : null,
        sportType: form.sportType,
        distanceMeters:
          form.distanceKm && Number.isFinite(distanceKm)
            ? distanceKm * 1000
            : null,
        importance: form.importance,
        goalType: form.goalType,
        targetTimeSeconds:
          form.goalType === "TARGET_TIME"
            ? (targetHours * 60 + targetMinutes) * 60
            : null,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
      };
      return event
        ? updateCompetitionEvent(
            event.id,
            workingVersion ?? event.version,
            payload,
          )
        : createCompetitionEvent(payload, createKeyRef.current);
    },
    onSuccess: async () => {
      await invalidate();
      toast.success(t("feedback.saved"));
      onOpenChange(false);
    },
    onError: (error) => {
      if (
        error instanceof ApiFetchError &&
        error.errorCode === "COMPETITION_EVENT_VERSION_CONFLICT"
      ) {
        const latest = (error.data as { latest?: CompetitionEvent } | undefined)
          ?.latest;
        if (latest) setConflictLatest(latest);
      }
      setFormError(
        error instanceof Error ? error.message : t("feedback.failed"),
      );
    },
  });

  const closeAfterMutation = async () => {
    await invalidate();
    onOpenChange(false);
  };
  const showActionError = () => setFormError(t("feedback.failed"));
  const cancelMutation = useMutation({
    mutationFn: () =>
      cancelCompetitionEvent(event!.id, workingVersion ?? event!.version),
    onSuccess: closeAfterMutation,
    onError: showActionError,
  });
  const restoreMutation = useMutation({
    mutationFn: () =>
      restoreCompetitionEvent(event!.id, workingVersion ?? event!.version),
    onSuccess: closeAfterMutation,
    onError: showActionError,
  });
  const deleteMutation = useMutation({
    mutationFn: () =>
      deleteCompetitionEvent(event!.id, workingVersion ?? event!.version),
    onSuccess: async () => {
      setDeleteConfirmOpen(false);
      await closeAfterMutation();
    },
    onError: showActionError,
  });
  const impactQuery = useQuery({
    queryKey: queryKeys.competitionImpact.current(
      "CALENDAR_RANGE",
      event?.startDate ?? "",
      event?.endDate || event?.startDate || "",
      localTodayYmd(),
      locale,
    ),
    queryFn: () =>
      getCurrentCompetitionImpact({
        scopeType: "CALENDAR_RANGE",
        scopeStartDate: event!.startDate,
        scopeEndDate: event!.endDate || event!.startDate,
        anchorDate: localTodayYmd(),
        locale,
      }),
    enabled: Boolean(open && event && mode === "view"),
    staleTime: 60_000,
    retry: false,
  });
  const submit = () => {
    if (!form.title.trim()) {
      setFormError(t("validation.nameRequired"));
      titleRef.current?.focus();
      return;
    }
    if (!form.startDate || (form.endDate && form.endDate < form.startDate)) {
      setFormError(t("validation.dateInvalid"));
      return;
    }
    if (
      form.goalType === "TARGET_TIME" &&
      Number(form.targetHours || 0) * 60 + Number(form.targetMinutes || 0) <= 0
    ) {
      setFormError(t("validation.targetRequired"));
      return;
    }
    saveMutation.mutate();
  };

  const impactResponse = impactQuery.data;
  const eventImpact = impactResponse?.result.eventAssessments.find(
    (assessment) => assessment.eventId === event?.id,
  );

  const eventDayDelta = event
    ? Math.round(
        (new Date(`${event.startDate}T00:00:00Z`).getTime() -
          new Date(`${localTodayYmd()}T00:00:00Z`).getTime()) /
          86_400_000,
      )
    : null;

  return (
    <>
      <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
        <AdaptiveDialogContent
          className="grid max-h-[88dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden overscroll-contain p-0"
          desktopClassName="sm:max-w-2xl"
          mobileClassName="max-h-[92dvh]"
        >
          <AdaptiveDialogHeader className="border-b px-5 py-4 text-left sm:px-6">
            <AdaptiveDialogTitle className="text-base">
              {t(
                event
                  ? mode === "view"
                    ? "dialog.viewTitle"
                    : "dialog.editTitle"
                  : "dialog.createTitle",
              )}
            </AdaptiveDialogTitle>
            <AdaptiveDialogDescription>
              {t("dialog.description")}
            </AdaptiveDialogDescription>
            {eventDayDelta != null ? (
              <p className="text-mobile-caption pc:text-xs font-medium text-rose-700 dark:text-rose-300">
                {eventDayDelta === 0
                  ? t("countdown.today")
                  : eventDayDelta > 0
                    ? t("countdown.future", { days: eventDayDelta })
                    : t("countdown.past", { days: Math.abs(eventDayDelta) })}
                {` · ${t(`status.${event!.status}`)}`}
              </p>
            ) : null}
          </AdaptiveDialogHeader>

          <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            {event && mode === "view" ? (
              <CompetitionEventDetails event={event} impactEnabled={false} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label
                    htmlFor="competition-title"
                    className="text-mobile-caption pc:text-xs font-medium"
                  >
                    {t("form.name")}
                  </label>
                  <Input
                    ref={titleRef}
                    id="competition-title"
                    name="competition-title"
                    autoComplete="off"
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <span className="text-mobile-caption pc:text-xs font-medium">
                    {t("form.dateRange")}
                  </span>
                  <DatePickerWithRange
                    popoverModal
                    startNewRangeOnOpen={!event}
                    date={{
                      from: parseLocalYmd(form.startDate),
                      to: parseLocalYmd(form.endDate),
                    }}
                    onDateChange={(range) => {
                      setForm((current) => ({
                        ...current,
                        startDate: range?.from
                          ? toLocalYmd(range.from)
                          : current.startDate,
                        endDate: range?.to ? toLocalYmd(range.to) : "",
                      }));
                      setFormError(null);
                    }}
                  />
                </div>
                <CompetitionTimePicker
                  value={form.startTime}
                  onChange={(value) => set("startTime", value)}
                />
                <CompetitionSportPicker
                  value={form.sportType}
                  onChange={(value) => set("sportType", value)}
                />
                <div className="space-y-1.5">
                  <label
                    htmlFor="competition-distance"
                    className="text-mobile-caption pc:text-xs font-medium"
                  >
                    {t("form.distance")}
                  </label>
                  <Input
                    id="competition-distance"
                    name="competition-distance"
                    autoComplete="off"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={form.distanceKm}
                    onChange={(e) => set("distanceKm", e.target.value)}
                  />
                </div>

                <fieldset className="space-y-2 sm:col-span-2">
                  <legend className="text-mobile-caption pc:text-xs font-medium">
                    {t("form.importance")}
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {IMPORTANCE.map((importance) => (
                      <button
                        key={importance}
                        type="button"
                        aria-pressed={form.importance === importance}
                        onClick={() => set("importance", importance)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          form.importance === importance &&
                            "border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600 dark:border-emerald-400 dark:bg-emerald-950/20 dark:ring-emerald-400",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2 text-sm font-medium">
                          <span>{t(`importance.${importance}.label`)}</span>
                          {form.importance === importance ? (
                            <CheckCircle2
                              aria-hidden="true"
                              className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                            />
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-mobile-caption pc:text-xs text-muted-foreground">
                          {t(`importance.${importance}.detail`)}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="space-y-1.5">
                  <label
                    htmlFor="competition-goal"
                    className="text-mobile-caption pc:text-xs font-medium"
                  >
                    {t("form.goal")}
                  </label>
                  <Select
                    value={form.goalType}
                    onValueChange={(value) =>
                      set("goalType", value as CompetitionGoalType)
                    }
                  >
                    <SelectTrigger id="competition-goal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GOALS.map((goal) => (
                        <SelectItem key={goal} value={goal}>
                          {t(`goals.${goal}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.goalType === "TARGET_TIME" ? (
                  <div className="space-y-1.5">
                    <span className="text-mobile-caption pc:text-xs font-medium">
                      {t("form.targetTime")}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        aria-label={t("form.targetHours")}
                        name="competition-target-hours"
                        autoComplete="off"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="168"
                        placeholder={t("form.hoursPlaceholder")}
                        value={form.targetHours}
                        onChange={(e) => set("targetHours", e.target.value)}
                      />
                      <Input
                        aria-label={t("form.targetMinutes")}
                        name="competition-target-minutes"
                        autoComplete="off"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="59"
                        placeholder={t("form.minutesPlaceholder")}
                        value={form.targetMinutes}
                        onChange={(e) => set("targetMinutes", e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div />
                )}
                <div className="space-y-1.5 sm:col-span-2">
                  <label
                    htmlFor="competition-location"
                    className="text-mobile-caption pc:text-xs font-medium"
                  >
                    {t("form.location")}
                  </label>
                  <Input
                    id="competition-location"
                    name="competition-location"
                    autoComplete="off"
                    value={form.location}
                    onChange={(e) => set("location", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label
                    htmlFor="competition-notes"
                    className="text-mobile-caption pc:text-xs font-medium"
                  >
                    {t("form.notes")}
                  </label>
                  <Textarea
                    id="competition-notes"
                    name="competition-notes"
                    autoComplete="off"
                    maxLength={4000}
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                  />
                </div>
              </div>
            )}

            {event && mode === "view" ? (
              <CompetitionImpactSummary
                className="mt-5"
                eventImpact={eventImpact}
                impactResponse={impactResponse}
                isError={impactQuery.isError}
                isPending={impactQuery.isPending}
              />
            ) : null}

            {conflictLatest ? (
              <section className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-mobile-caption pc:text-xs dark:border-amber-900/60 dark:bg-amber-950/25">
                <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                  {t("conflict.title")}
                </h3>
                <p className="mt-1 text-amber-800 dark:text-amber-200">
                  {conflictLatest.title} · {conflictLatest.startDate} · v
                  {conflictLatest.version}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setForm(formFromEvent(conflictLatest, defaultDate));
                      setWorkingVersion(conflictLatest.version);
                      setConflictLatest(null);
                    }}
                  >
                    {t("conflict.useServer")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setWorkingVersion(conflictLatest.version);
                      setConflictLatest(null);
                    }}
                  >
                    {t("conflict.keepDraft")}
                  </Button>
                </div>
              </section>
            ) : null}
            {formError ? (
              <p
                role="alert"
                aria-live="polite"
                className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </p>
            ) : null}
          </div>

          <AdaptiveDialogFooter className="flex-col-reverse items-stretch gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 justify-between gap-1 sm:justify-start">
              {event && mode === "view" && event.status === "PLANNED" ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate()}
                >
                  {t("actions.cancelEvent")}
                </Button>
              ) : null}
              {event && mode === "view" && event.status === "CANCELLED" ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={restoreMutation.isPending}
                  onClick={() => restoreMutation.mutate()}
                >
                  {t("actions.restoreEvent")}
                </Button>
              ) : null}
              {event && mode === "view" ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 aria-hidden="true" className="mr-1 h-4 w-4" />
                  {t("actions.deleteEvent")}
                </Button>
              ) : null}
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full sm:w-auto sm:min-w-20"
                onClick={() => {
                  if (event && mode === "edit") {
                    setForm(formFromEvent(event, defaultDate));
                    setFormError(null);
                    setConflictLatest(null);
                    setMode("view");
                    return;
                  }
                  onOpenChange(false);
                }}
              >
                {t(
                  event && mode === "edit"
                    ? "actions.cancelEdit"
                    : "actions.close",
                )}
              </Button>
              {event && mode === "view" ? (
                <Button
                  type="button"
                  size="sm"
                  className="w-full sm:w-auto sm:min-w-20"
                  onClick={() => setMode("edit")}
                >
                  <Pencil aria-hidden="true" className="mr-1.5 h-4 w-4" />
                  {t("actions.edit")}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="w-full sm:w-auto sm:min-w-20"
                  disabled={saveMutation.isPending}
                  onClick={submit}
                >
                  {t(
                    saveMutation.isPending ? "actions.saving" : "actions.save",
                  )}
                </Button>
              )}
            </div>
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirm.description", { title: event?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.close")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(clickEvent) => {
                clickEvent.preventDefault();
                deleteMutation.mutate();
              }}
            >
              {t(
                deleteMutation.isPending
                  ? "actions.deleting"
                  : "actions.confirmDelete",
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
