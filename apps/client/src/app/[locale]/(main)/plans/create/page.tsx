"use client";

import {
  ArrowLeft,
  ArrowRight,
  Bike,
  CalendarDays,
  Check,
  CheckCircle2,
  Dumbbell,
  Footprints,
  RotateCcw,
  Sparkles,
  Target,
  Waves,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getPlanLibraryHref } from "@/lib/plan-navigation";
import {
  getStrengthEquipmentKey,
  STRENGTH_EQUIPMENT_OPTIONS,
  type StrengthEquipmentKey,
} from "@/lib/strength-catalog";
import type {
  AiPlanSeedIntent,
  AiPlanSeedRaceDiscipline,
  AiPlanSeedRaceDistance,
  AiPlanSeedSport,
  AiPlanSeedStrengthPreference,
} from "@/lib/ai-plan-seed-prompt";

type IntentOption = {
  value: AiPlanSeedIntent;
  title: string;
  description: string;
};

type SportOption = {
  value: AiPlanSeedSport;
  title: string;
  icon: ReactNode;
};

type TranslateFn = ReturnType<typeof useTranslations>;

function buildSportOptions(t: TranslateFn): SportOption[] {
  // 运动类型选项会被多个区域复用，图标和文案在这里集中生成。
  return [
    {
      value: "run",
      title: t("sport.run"),
      icon: <Footprints className="h-4 w-4" />,
    },
    {
      value: "cycle",
      title: t("sport.cycle"),
      icon: <Bike className="h-4 w-4" />,
    },
    {
      value: "swim",
      title: t("sport.swim"),
      icon: <Waves className="h-4 w-4" />,
    },
    {
      value: "strength",
      title: t("sport.strength"),
      icon: <Dumbbell className="h-4 w-4" />,
    },
  ];
}

function buildIntentOptions(t: TranslateFn): IntentOption[] {
  // 计划意图决定后续传给 AI Coach 的 seed 参数。
  return [
    {
      value: "racePrep",
      title: t("intent.racePrep.title"),
      description: t("intent.racePrep.description"),
    },
    {
      value: "fitnessBuild",
      title: t("intent.fitnessBuild.title"),
      description: t("intent.fitnessBuild.description"),
    },
    {
      value: "skillFocus",
      title: t("intent.skillFocus.title"),
      description: t("intent.skillFocus.description"),
    },
    {
      value: "returnToTraining",
      title: t("intent.returnToTraining.title"),
      description: t("intent.returnToTraining.description"),
    },
    {
      value: "healthFatLoss",
      title: t("intent.healthFatLoss.title"),
      description: t("intent.healthFatLoss.description"),
    },
  ];
}

function buildRaceDistancesByDiscipline(
  t: TranslateFn,
): Record<
  AiPlanSeedRaceDiscipline,
  Array<{ value: AiPlanSeedRaceDistance; label: string }>
> {
  // 比赛距离依赖项目类型，切换 discipline 时只展示对应候选项。
  return {
    run: [
      { value: "5k", label: "5K" },
      { value: "10k", label: "10K" },
      { value: "half", label: t("raceDistance.run.half") },
      { value: "full", label: t("raceDistance.run.full") },
    ],
    tri: [
      { value: "sprint", label: "Sprint" },
      { value: "olympic", label: "Olympic" },
      { value: "halfIron", label: "Half Iron" },
      { value: "fullIron", label: "Full Iron" },
    ],
    cycle: [
      { value: "criterium", label: t("raceDistance.cycle.criterium") },
      { value: "road", label: t("raceDistance.cycle.road") },
    ],
  };
}

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={className}>{children}</section>;
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="mt-0.5 text-mobile-caption pc:text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function clampNumber(value: number, min: number, max: number) {
  // 数字输入允许用户自由编辑，提交到状态前统一夹在可接受范围内。
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export default function V2PlanCreatePage() {
  // 创建页只收集用户偏好，真正生成计划交给 AI Coach 通过 URL seed 启动。
  const t = useTranslations("V2PlanCreatePage");
  const tEquipment = useTranslations("StrengthCatalog.equipment");
  useSetPageTitle(t("header.title"));
  const router = useRouter();
  const isMobile = useIsMobile();
  const planLibraryHref = getPlanLibraryHref(isMobile);
  const sportOptions = useMemo(() => buildSportOptions(t), [t]);
  const intentOptions = useMemo(() => buildIntentOptions(t), [t]);
  const raceDistancesByDiscipline = useMemo(
    () => buildRaceDistancesByDiscipline(t),
    [t],
  );
  const [sportTypes, setSportTypes] = useState<AiPlanSeedSport[]>(["run"]);
  const [intent, setIntent] = useState<AiPlanSeedIntent>("racePrep");
  const [raceDiscipline, setRaceDiscipline] =
    useState<AiPlanSeedRaceDiscipline>("run");
  const [raceDistance, setRaceDistance] =
    useState<AiPlanSeedRaceDistance>("full");
  const [cycleWeeks, setCycleWeeks] = useState(12);
  const [weeklyDays, setWeeklyDays] = useState(5);
  const [dailyMinutes, setDailyMinutes] = useState(70);
  const [strengthPreference, setStrengthPreference] =
    useState<AiPlanSeedStrengthPreference>("AUTO");
  const [strengthDays, setStrengthDays] = useState(2);
  const [strengthMinutes, setStrengthMinutes] = useState(40);
  const [equipment, setEquipment] = useState<StrengthEquipmentKey[]>([
    "bodyweight",
    "dumbbell",
  ]);
  const selectedSportsText = sportTypes
    .map((sport) => sportOptions.find((o) => o.value === sport)?.title)
    .filter(Boolean)
    .join(t("common.joiner"));
  const selectedIntentTitle =
    intentOptions.find((item) => item.value === intent)?.title ?? "";
  const selectedRaceDisciplineLabel =
    raceDiscipline === "run"
      ? t("raceDiscipline.run")
      : raceDiscipline === "tri"
        ? t("raceDiscipline.tri")
        : t("raceDiscipline.cycle");
  const selectedRaceDistanceLabel =
    raceDistancesByDiscipline[raceDiscipline].find(
      (item) => item.value === raceDistance,
    )?.label ?? raceDistance;
  const strengthPreferenceText = t(`strength.preference.${strengthPreference}`);
  const selectedEquipmentText = equipment
    .map((item) => tEquipment(item))
    .join(t("common.joiner"));

  const selectStrengthPreference = (
    preference: AiPlanSeedStrengthPreference,
  ) => {
    setStrengthPreference(preference);
    const hasStrength = sportTypes.includes("strength");
    if (preference === "INCLUDE" && !hasStrength) {
      setSportTypes([...sportTypes, "strength"]);
      return;
    }
    if (preference !== "INCLUDE" && hasStrength) {
      setSportTypes(
        sportTypes.length > 1
          ? sportTypes.filter((item) => item !== "strength")
          : ["run"],
      );
    }
  };

  const toggleEquipment = (value: StrengthEquipmentKey) => {
    setEquipment((current) => {
      if (current.includes(value)) {
        return current.length === 1
          ? current
          : current.filter((item) => item !== value);
      }
      return [...current, value];
    });
  };

  const startCreatePlan = () => {
    // 把表单状态编码进查询参数，AI Coach 首次进入时会解析成计划创建提示。
    const params = new URLSearchParams({
      planIntent: intent,
      sports: sportTypes.join(","),
      weeks: String(cycleWeeks),
      days: String(weeklyDays),
      mins: String(dailyMinutes),
      strength: strengthPreference.toLowerCase(),
      strengthDays: String(strengthDays),
      strengthMins: String(strengthMinutes),
      equipment: equipment.join(","),
    });

    if (intent === "racePrep") {
      params.set("raceD", raceDiscipline);
      params.set("raceDist", raceDistance);
    }

    router.push(`/ai-coach?${params.toString()}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 pb-2 pc:gap-3">
      <header className="px-1 py-1">
        <div className="mb-2">
          <Link
            href={planLibraryHref}
            className="inline-flex items-center gap-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("header.backToPlans")}
          </Link>
        </div>
        <section className="rounded-md bg-neutral-100 p-2.5 dark:bg-muted/45">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-mobile-caption pc:text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{t("header.badge")}</span>
            </div>
            <h1 className="mt-1 truncate text-base font-semibold tracking-normal text-foreground">
              {t("header.title")}
            </h1>
            <p className="mt-1 text-mobile-caption pc:text-xs text-muted-foreground">
              {t("header.description")}
            </p>
          </div>
        </section>
      </header>

      <div className="flex flex-col gap-2 pc:grid pc:grid-cols-[minmax(0,1fr)_320px] pc:items-start pc:gap-3">
        <div className="order-1 min-w-0 pc:col-start-2 pc:row-start-1 pc:order-none">
          <Panel className="p-3">
            <SectionTitle title={t("brief.title")} />
            <div className="space-y-2 text-sm">
              <div className="rounded-md bg-neutral-100 px-3 py-2 dark:bg-muted/45">
                {t("brief.sports", { value: selectedSportsText })}
              </div>
              <div className="rounded-md bg-neutral-100 px-3 py-2 dark:bg-muted/45">
                {t("brief.intent", { value: selectedIntentTitle })}
              </div>
              <div className="rounded-md bg-neutral-100 px-3 py-2 dark:bg-muted/45">
                {t("brief.cycle", {
                  weeks: cycleWeeks,
                  weeklyDays,
                  dailyMinutes,
                })}
              </div>
              {intent === "racePrep" ? (
                <div className="rounded-md bg-neutral-100 px-3 py-2 dark:bg-muted/45">
                  {t("brief.race", {
                    discipline: selectedRaceDisciplineLabel,
                    distance: selectedRaceDistanceLabel,
                  })}
                </div>
              ) : null}
              <div className="rounded-md bg-neutral-100 px-3 py-2 dark:bg-muted/45">
                {t("brief.strength", { value: strengthPreferenceText })}
              </div>
              {strengthPreference !== "EXCLUDE" ? (
                <div className="rounded-md bg-neutral-100 px-3 py-2 dark:bg-muted/45">
                  {t("brief.equipment", { value: selectedEquipmentText })}
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              onClick={startCreatePlan}
              className="mt-3 w-full"
            >
              {t("brief.start")}
            </Button>
            <p className="mt-2 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
              {t("brief.handoff")}
            </p>
          </Panel>
        </div>

        <main className="order-2 flex min-w-0 flex-col gap-2 pc:col-start-1 pc:row-span-3 pc:row-start-1 pc:order-none pc:gap-3">
          <Panel className="p-3">
            <SectionTitle
              title={t("mainSport.title")}
              description={t("mainSport.description")}
            />
            <ToggleGroup
              type="multiple"
              value={sportTypes}
              onValueChange={(values) => {
                if (values.length === 0) return;
                const next = values as AiPlanSeedSport[];
                const includedStrength = sportTypes.includes("strength");
                const includesStrength = next.includes("strength");
                setSportTypes(next);
                if (includedStrength !== includesStrength) {
                  setStrengthPreference(
                    includesStrength ? "INCLUDE" : "EXCLUDE",
                  );
                }
              }}
              spacing={2}
              className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
            >
              {sportOptions.map((option) => {
                const selected = sportTypes.includes(option.value);

                return (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    aria-label={option.title}
                    className="h-auto min-h-11 justify-between bg-muted/55 px-3 py-3 data-[state=on]:bg-accent"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="text-muted-foreground">
                        {option.icon}
                      </span>
                      {option.title}
                    </span>
                    {selected ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : null}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </Panel>

          <Panel className="p-3">
            <SectionTitle
              title={t("trainingIntent.title")}
              description={t("trainingIntent.description")}
            />
            <ToggleGroup
              type="single"
              value={intent}
              onValueChange={(value) => {
                if (value) setIntent(value as AiPlanSeedIntent);
              }}
              spacing={2}
              className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {intentOptions.map((option) => {
                const selected = intent === option.value;

                return (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className="h-auto min-h-16 justify-start whitespace-normal bg-muted/55 px-3 py-3 text-left data-[state=on]:bg-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">
                          {option.title}
                        </div>
                        <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                          {option.description}
                        </p>
                      </div>
                      {selected ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : null}
                    </div>
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </Panel>

          {intent === "racePrep" ? (
            <Panel className="p-3">
              <SectionTitle title={t("raceInfo.title")} />
              <FieldGroup className="grid gap-2 sm:grid-cols-2">
                <Field className="gap-1">
                  <FieldLabel className="text-mobile-caption text-muted-foreground pc:text-xs">
                    {t("raceInfo.discipline")}
                  </FieldLabel>
                  <Select
                    value={raceDiscipline}
                    onValueChange={(value) => {
                      const next = value as AiPlanSeedRaceDiscipline;
                      setRaceDiscipline(next);
                      setRaceDistance(raceDistancesByDiscipline[next][0].value);
                    }}
                  >
                    <SelectTrigger className="border-0 bg-muted/55 shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="run">
                          {t("raceDiscipline.run")}
                        </SelectItem>
                        <SelectItem value="tri">
                          {t("raceDiscipline.tri")}
                        </SelectItem>
                        <SelectItem value="cycle">
                          {t("raceDiscipline.cycle")}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="gap-1">
                  <FieldLabel className="text-mobile-caption text-muted-foreground pc:text-xs">
                    {t("raceInfo.distance")}
                  </FieldLabel>
                  <Select
                    value={raceDistance}
                    onValueChange={(value) =>
                      setRaceDistance(value as AiPlanSeedRaceDistance)
                    }
                  >
                    <SelectTrigger className="border-0 bg-muted/55 shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {raceDistancesByDiscipline[raceDiscipline].map(
                          (item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ),
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            </Panel>
          ) : null}

          <Panel className="p-3">
            <SectionTitle title={t("cycleConstraints.title")} />
            <FieldGroup className="grid gap-2 sm:grid-cols-3">
              <Field className="gap-1">
                <FieldLabel className="text-mobile-caption text-muted-foreground pc:text-xs">
                  {t("cycleConstraints.cycleLength")}
                </FieldLabel>
                <Select
                  value={String(cycleWeeks)}
                  onValueChange={(value) => setCycleWeeks(Number(value))}
                >
                  <SelectTrigger className="border-0 bg-muted/55 shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {[4, 6, 8, 12, 16].map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {t("cycleConstraints.weekOption", { value })}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="gap-1">
                <FieldLabel
                  htmlFor="weekly-days"
                  className="text-mobile-caption text-muted-foreground pc:text-xs"
                >
                  {t("cycleConstraints.daysPerWeek")}
                </FieldLabel>
                <Input
                  id="weekly-days"
                  type="number"
                  min={1}
                  max={7}
                  value={weeklyDays}
                  onChange={(event) =>
                    setWeeklyDays(clampNumber(Number(event.target.value), 1, 7))
                  }
                  className="border-0 bg-muted/55 font-semibold shadow-none"
                />
              </Field>
              <Field className="gap-1">
                <FieldLabel
                  htmlFor="daily-minutes"
                  className="text-mobile-caption text-muted-foreground pc:text-xs"
                >
                  {t("cycleConstraints.dailyMinutes")}
                </FieldLabel>
                <Input
                  id="daily-minutes"
                  type="number"
                  min={20}
                  max={300}
                  step={5}
                  value={dailyMinutes}
                  onChange={(event) =>
                    setDailyMinutes(
                      clampNumber(Number(event.target.value), 20, 300),
                    )
                  }
                  className="border-0 bg-muted/55 font-semibold shadow-none"
                />
              </Field>
            </FieldGroup>
          </Panel>

          <Panel className="p-3">
            <SectionTitle
              title={t("strength.title")}
              description={t("strength.description")}
            />
            <ToggleGroup
              type="single"
              value={strengthPreference}
              onValueChange={(value) => {
                if (value)
                  selectStrengthPreference(
                    value as AiPlanSeedStrengthPreference,
                  );
              }}
              spacing={2}
              className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3"
            >
              {(["AUTO", "INCLUDE", "EXCLUDE"] as const).map((option) => (
                <ToggleGroupItem
                  key={option}
                  value={option}
                  className="h-auto min-h-10 justify-between bg-muted/55 px-3 py-2.5 text-left data-[state=on]:bg-accent"
                >
                  <span className="flex items-center gap-2">
                    <Dumbbell className="h-4 w-4 text-muted-foreground" />
                    {t(`strength.preference.${option}`)}
                  </span>
                  {strengthPreference === option ? (
                    <CheckCircle2 className="h-4 w-4 text-violet-500" />
                  ) : null}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {strengthPreference !== "EXCLUDE" ? (
              <>
                <FieldGroup className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field className="gap-1">
                    <FieldLabel
                      htmlFor="strength-days"
                      className="text-mobile-caption text-muted-foreground pc:text-xs"
                    >
                      {t("strength.sessionsPerWeek")}
                    </FieldLabel>
                    <Input
                      id="strength-days"
                      type="number"
                      min={1}
                      max={7}
                      value={strengthDays}
                      onChange={(event) =>
                        setStrengthDays(
                          clampNumber(Number(event.target.value), 1, 7),
                        )
                      }
                      className="border-0 bg-muted/55 font-semibold shadow-none"
                    />
                  </Field>
                  <Field className="gap-1">
                    <FieldLabel
                      htmlFor="strength-minutes"
                      className="text-mobile-caption text-muted-foreground pc:text-xs"
                    >
                      {t("strength.minutesPerSession")}
                    </FieldLabel>
                    <Input
                      id="strength-minutes"
                      type="number"
                      min={15}
                      max={180}
                      step={5}
                      value={strengthMinutes}
                      onChange={(event) =>
                        setStrengthMinutes(
                          clampNumber(Number(event.target.value), 15, 180),
                        )
                      }
                      className="border-0 bg-muted/55 font-semibold shadow-none"
                    />
                  </Field>
                </FieldGroup>
                <Field className="mt-2 gap-1">
                  <FieldLabel className="text-mobile-caption text-muted-foreground pc:text-xs">
                    {t("strength.availableEquipment")}
                  </FieldLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-auto min-h-10 w-full justify-between whitespace-normal px-3 py-2 text-left"
                        aria-label={`${t("strength.availableEquipment")}: ${selectedEquipmentText}`}
                      >
                        <span className="line-clamp-2 min-w-0">
                          {selectedEquipmentText}
                        </span>
                        <span className="shrink-0 text-mobile-caption text-muted-foreground pc:text-xs">
                          {equipment.length}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[var(--radix-popover-trigger-width)] p-0"
                    >
                      <Command>
                        <CommandList>
                          <CommandGroup>
                            {STRENGTH_EQUIPMENT_OPTIONS.map((option) => {
                              const equipmentKey =
                                getStrengthEquipmentKey(option);
                              const selected = equipment.includes(option);
                              return (
                                <CommandItem
                                  key={option}
                                  value={option}
                                  onSelect={() => toggleEquipment(option)}
                                  aria-selected={selected}
                                >
                                  <Check
                                    className={
                                      selected ? "opacity-100" : "opacity-0"
                                    }
                                  />
                                  {equipmentKey
                                    ? tEquipment(equipmentKey)
                                    : option}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </Field>
              </>
            ) : null}
          </Panel>
        </main>

        <div className="order-3 min-w-0 pc:col-start-2 pc:row-start-2 pc:order-none">
          <Panel className="p-3">
            <SectionTitle title={t("nextFlow.title")} />
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 rounded-md bg-neutral-100 px-3 py-2 dark:bg-muted/45">
                <Sparkles className="h-4 w-4" />
                {t("nextFlow.step1")}
              </div>
              <div className="flex items-center gap-2 rounded-md bg-neutral-100 px-3 py-2 dark:bg-muted/45">
                <CalendarDays className="h-4 w-4" />
                {t("nextFlow.step2")}
              </div>
              <div className="flex items-center gap-2 rounded-md bg-neutral-100 px-3 py-2 dark:bg-muted/45">
                <Target className="h-4 w-4" />
                {t("nextFlow.step3")}
              </div>
            </div>
          </Panel>
        </div>

        <div className="order-4 min-w-0 pc:col-start-2 pc:row-start-3 pc:order-none">
          <Panel className="p-3">
            <SectionTitle title={t("alternative.title")} />
            <Link
              href={planLibraryHref}
              className="flex items-center justify-between gap-3 rounded-md bg-neutral-100 px-3 py-2.5 text-sm transition-colors hover:bg-neutral-200 dark:bg-muted/45 dark:hover:bg-muted"
            >
              <span className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
                {t("alternative.backToPlans")}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
