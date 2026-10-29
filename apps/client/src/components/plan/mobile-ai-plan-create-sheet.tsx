"use client";

import {
  Bike,
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Footprints,
  Minus,
  Plus,
  Waves,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type {
  AiPlanSeedIntent,
  AiPlanSeedRaceDiscipline,
  AiPlanSeedRaceDistance,
  AiPlanSeedSport,
} from "@/lib/ai-plan-seed-prompt";
import { cn } from "@/lib/utils";
import { useMobileOnlyOpen } from "@/hooks/use-mobile";

type SheetPage = "form" | "intent" | "discipline" | "distance";

type Option<T extends string> = {
  value: T;
  title: string;
  description?: string;
};

function SettingRow({
  label,
  value,
  detail,
  onClick,
}: {
  label: string;
  value: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-3 rounded-surface bg-neutral-100 px-4 py-3 text-left transition-colors active:bg-neutral-200 dark:bg-muted/45 dark:active:bg-muted"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-mobile-caption pc:text-xs text-muted-foreground">{label}</span>
        <span className="mt-1 block truncate text-sm font-semibold text-foreground">
          {value}
        </span>
        {detail ? (
          <span className="mt-0.5 block line-clamp-1 text-mobile-caption pc:text-xs text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function StepperRow({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-surface bg-neutral-100 px-4 py-3 dark:bg-muted/45">
      <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`${label} -`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
          className="grid size-9 place-items-center rounded-control bg-background text-foreground disabled:opacity-35 dark:bg-black/20"
        >
          <Minus className="size-4" />
        </button>
        <span className="min-w-16 text-center text-sm font-semibold tabular-nums">
          {value} {unit}
        </span>
        <button
          type="button"
          aria-label={`${label} +`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
          className="grid size-9 place-items-center rounded-control bg-background text-foreground disabled:opacity-35 dark:bg-black/20"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

function SelectionList<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: Array<Option<T>>;
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="space-y-2 px-safe-or-4 py-4">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={cn(
              "flex min-h-16 w-full items-center gap-3 rounded-surface px-4 py-3 text-left transition-colors",
              selected
                ? "bg-emerald-500/10 ring-1 ring-emerald-500/30"
                : "bg-neutral-100 active:bg-neutral-200 dark:bg-muted/45 dark:active:bg-muted",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">
                {option.title}
              </span>
              {option.description ? (
                <span className="mt-0.5 block text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </span>
            {selected ? (
              <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function MobileAiPlanCreateSheet({
  open,
  onOpenChange,
  onBackToMode,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBackToMode: () => void;
  onGenerate: (params: URLSearchParams) => void;
}) {
  const t = useTranslations("V2PlanCreatePage");
  const [page, setPage] = useState<SheetPage>("form");
  const [sportTypes, setSportTypes] = useState<AiPlanSeedSport[]>(["run"]);
  const [intent, setIntent] = useState<AiPlanSeedIntent>("racePrep");
  const [raceDiscipline, setRaceDiscipline] =
    useState<AiPlanSeedRaceDiscipline>("run");
  const [raceDistance, setRaceDistance] =
    useState<AiPlanSeedRaceDistance>("full");
  const [cycleWeeks, setCycleWeeks] = useState(12);
  const [weeklyDays, setWeeklyDays] = useState(5);
  const [dailyMinutes, setDailyMinutes] = useState(70);
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) setPage("form");
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );
  const mobileOpen = useMobileOnlyOpen(open, handleOpenChange);

  const sports = useMemo<Array<Option<AiPlanSeedSport> & { icon: ReactNode }>>(
    () => [
      { value: "run", title: t("sport.run"), icon: <Footprints /> },
      { value: "cycle", title: t("sport.cycle"), icon: <Bike /> },
      { value: "swim", title: t("sport.swim"), icon: <Waves /> },
      {
        value: "strength",
        title: t("sport.strength"),
        icon: <Dumbbell />,
      },
    ],
    [t],
  );
  const intents = useMemo<Array<Option<AiPlanSeedIntent>>>(
    () =>
      (
        [
          "racePrep",
          "fitnessBuild",
          "skillFocus",
          "returnToTraining",
          "healthFatLoss",
        ] as const
      ).map((value) => ({
        value,
        title: t(`intent.${value}.title`),
        description: t(`intent.${value}.description`),
      })),
    [t],
  );
  const disciplines = useMemo<Array<Option<AiPlanSeedRaceDiscipline>>>(
    () => [
      { value: "run", title: t("raceDiscipline.run") },
      { value: "tri", title: t("raceDiscipline.tri") },
      { value: "cycle", title: t("raceDiscipline.cycle") },
    ],
    [t],
  );
  const distancesByDiscipline = useMemo<
    Record<AiPlanSeedRaceDiscipline, Array<Option<AiPlanSeedRaceDistance>>>
  >(
    () => ({
      run: [
        { value: "5k", title: "5K" },
        { value: "10k", title: "10K" },
        { value: "half", title: t("raceDistance.run.half") },
        { value: "full", title: t("raceDistance.run.full") },
      ],
      tri: [
        { value: "sprint", title: "Sprint" },
        { value: "olympic", title: "Olympic" },
        { value: "halfIron", title: "Half Iron" },
        { value: "fullIron", title: "Full Iron" },
      ],
      cycle: [
        { value: "criterium", title: t("raceDistance.cycle.criterium") },
        { value: "road", title: t("raceDistance.cycle.road") },
      ],
    }),
    [t],
  );

  const intentOption = intents.find((option) => option.value === intent);
  const disciplineOption = disciplines.find(
    (option) => option.value === raceDiscipline,
  );
  const distanceOptions = distancesByDiscipline[raceDiscipline];
  const distanceOption = distanceOptions.find(
    (option) => option.value === raceDistance,
  );

  const toggleSport = (sport: AiPlanSeedSport) => {
    setSportTypes((current) => {
      if (current.includes(sport)) {
        return current.length === 1
          ? current
          : current.filter((value) => value !== sport);
      }
      return [...current, sport];
    });
  };

  const submit = () => {
    const params = new URLSearchParams({
      planIntent: intent,
      sports: sportTypes.join(","),
      weeks: String(cycleWeeks),
      days: String(weeklyDays),
      mins: String(dailyMinutes),
      strength: sportTypes.includes("strength") ? "include" : "auto",
      strengthDays: "2",
      strengthMins: "40",
      equipment: "bodyweight,dumbbell",
    });
    if (intent === "racePrep") {
      params.set("raceD", raceDiscipline);
      params.set("raceDist", raceDistance);
    }
    onGenerate(params);
  };

  const goBack = () => {
    if (page !== "form") {
      setPage("form");
      return;
    }
    onBackToMode();
  };

  const title =
    page === "intent"
      ? t("trainingIntent.title")
      : page === "discipline"
        ? t("raceInfo.discipline")
        : page === "distance"
          ? t("raceInfo.distance")
          : t("header.title");

  return (
    <Drawer
      open={mobileOpen}
      onOpenChange={handleOpenChange}
      shouldScaleBackground={false}
    >
      <DrawerContent
        data-testid="mobile-ai-plan-create-sheet"
        className="h-[96dvh] max-h-[96dvh] rounded-t-overlay border-0 bg-background"
      >
        <DrawerHeader className="shrink-0 border-b border-border/60 px-3 pb-3 pt-2 text-left">
          <div className="grid min-h-11 grid-cols-[44px_minmax(0,1fr)_44px] items-center">
            <button
              type="button"
              onClick={goBack}
              className="grid size-11 place-items-center rounded-full text-emerald-600 transition-colors active:bg-muted"
            >
              <ChevronLeft className="size-5" />
            </button>
            <DrawerTitle className="truncate text-center text-[17px] font-semibold">
              {title}
            </DrawerTitle>
            {page === "form" ? (
              <button
                type="button"
                onClick={submit}
                aria-label={t("brief.start")}
                className="grid size-11 place-items-center rounded-full bg-emerald-600 text-white transition-colors active:bg-emerald-700"
              >
                <Check className="size-5" />
              </button>
            ) : (
              <span />
            )}
          </div>
          <DrawerDescription className="sr-only">
            {t("header.description")}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {page === "intent" ? (
            <SelectionList
              options={intents}
              value={intent}
              onSelect={(value) => {
                setIntent(value);
                setPage("form");
              }}
            />
          ) : page === "discipline" ? (
            <SelectionList
              options={disciplines}
              value={raceDiscipline}
              onSelect={(value) => {
                setRaceDiscipline(value);
                setRaceDistance(distancesByDiscipline[value][0].value);
                setPage("form");
              }}
            />
          ) : page === "distance" ? (
            <SelectionList
              options={distanceOptions}
              value={raceDistance}
              onSelect={(value) => {
                setRaceDistance(value);
                setPage("form");
              }}
            />
          ) : (
            <div className="space-y-6 px-safe-or-4 py-4">
              <section>
                <h2 className="mb-2 px-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground">
                  {t("mainSport.title")}
                </h2>
                <div className="grid grid-cols-4 gap-2">
                  {sports.map((sport) => {
                    const selected = sportTypes.includes(sport.value);
                    return (
                      <button
                        key={sport.value}
                        type="button"
                        onClick={() => toggleSport(sport.value)}
                        className={cn(
                          "flex min-w-0 flex-col items-center gap-2 rounded-control-lg px-2 py-3 text-center transition-colors [&_svg]:size-5",
                          selected
                            ? "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300"
                            : "bg-neutral-100 text-muted-foreground active:bg-neutral-200 dark:bg-muted/45 dark:active:bg-muted",
                        )}
                      >
                        {sport.icon}
                        <span className="w-full truncate text-mobile-caption pc:text-xs font-semibold">
                          {sport.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 px-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                  {t("mainSport.description")}
                </p>
              </section>

              <section>
                <h2 className="mb-2 px-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground">
                  {t("trainingIntent.title")}
                </h2>
                <SettingRow
                  label={t("trainingIntent.title")}
                  value={intentOption?.title ?? ""}
                  detail={intentOption?.description}
                  onClick={() => setPage("intent")}
                />
              </section>

              {intent === "racePrep" ? (
                <section>
                  <h2 className="mb-2 px-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground">
                    {t("raceInfo.title")}
                  </h2>
                  <div className="grid grid-cols-2 gap-2">
                    <SettingRow
                      label={t("raceInfo.discipline")}
                      value={disciplineOption?.title ?? ""}
                      onClick={() => setPage("discipline")}
                    />
                    <SettingRow
                      label={t("raceInfo.distance")}
                      value={distanceOption?.title ?? ""}
                      onClick={() => setPage("distance")}
                    />
                  </div>
                </section>
              ) : null}

              <section>
                <h2 className="mb-2 px-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground">
                  {t("cycleConstraints.title")}
                </h2>
                <div className="space-y-2">
                  <StepperRow
                    label={t("cycleConstraints.cycleLength")}
                    value={cycleWeeks}
                    unit={t("cycleConstraints.weekOption", {
                      value: "",
                    }).trim()}
                    min={4}
                    max={24}
                    step={1}
                    onChange={setCycleWeeks}
                  />
                  <StepperRow
                    label={t("cycleConstraints.daysPerWeek")}
                    value={weeklyDays}
                    unit=""
                    min={2}
                    max={7}
                    step={1}
                    onChange={setWeeklyDays}
                  />
                  <StepperRow
                    label={t("cycleConstraints.dailyMinutes")}
                    value={dailyMinutes}
                    unit="min"
                    min={30}
                    max={180}
                    step={5}
                    onChange={setDailyMinutes}
                  />
                </div>
              </section>

              <p className="px-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                {t("brief.handoff")}
              </p>
            </div>
          )}
        </div>

        {page === "form" ? (
          <DrawerFooter className="shrink-0 border-t border-border/60 bg-background px-safe-or-4 py-3">
            <button
              type="button"
              data-testid="mobile-ai-plan-generate"
              onClick={submit}
              className="min-h-11 w-full rounded-control-lg bg-foreground px-4 text-sm font-semibold text-background transition-opacity active:opacity-80"
            >
              {t("brief.start")}
            </button>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
