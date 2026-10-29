"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  BarChart3,
  Bike,
  Brain,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Footprints,
  Gauge,
  HeartPulse,
  Loader2,
  UploadCloud,
  Waves,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { SportType as ApiSportType } from "@/api/activities";
import { track } from "@/lib/analytics";
import {
  BodyMetricTypes,
  getUserSettings,
  replaceUserBodyMetrics,
  replaceUserFitnessMetricManualHistory,
  updateUserProfile,
} from "@/api/settings";
import { useChangeIsNewUser } from "@/api/use-user";
import {
  fetchAiDataConsentStatus,
  useAiDataConsent,
  useUpdateAiDataConsent,
  type AiDataConsentStatus,
} from "@/api/ai-data-consent";
import { useRuntimeCapabilities } from "@/api/runtime-capabilities";
import { useUserProfile } from "@/hooks/useUserProfile";
import { queryKeys } from "@/lib/query-keys";
import { invalidateActivityDerivedCaches } from "@/lib/query-invalidation";
import {
  useStore,
  type PowerUnit,
  type SportType as StoreSportType,
  type TimeFormat,
} from "@/lib/store";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  canProceedFromStep2,
  getEstimatedMaxHeartRate,
  getEstimatedRestHeartRate,
  type PreferredSport,
} from "@/app/[locale]/(main)/_home/components/new-user-dialog-model";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { AiDataConsentDisclosure } from "@/components/ai-consent/AiDataConsentDisclosure";
import { getOnboardingNextPathFromLocation } from "@/lib/auth-callback";
import type { SelfHostAiConfigurationResult } from "@/app/[locale]/(main)/settings/component/SelfHostAiSettings";
import { OnboardingCompletionExtension } from "@deployment/managed-ui";

const OnboardingImportStep = dynamic(
  () =>
    import("./OnboardingImportStep").then(
      (module) => module.OnboardingImportStep,
    ),
  {
    ssr: false,
    loading: () => (
      <section
        aria-busy="true"
        className="rounded-surface bg-muted/45 p-5 sm:p-6"
      >
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-8 w-56 max-w-full animate-pulse rounded bg-muted" />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="h-52 animate-pulse rounded-surface bg-background/70" />
          <div className="h-52 animate-pulse rounded-surface bg-background/70" />
        </div>
      </section>
    ),
  },
);

const SelfHostAiSettings = dynamic(
  () =>
    import("@/app/[locale]/(main)/settings/component/SelfHostAiSettings").then(
      (module) => module.SelfHostAiSettings,
    ),
  { ssr: false },
);

const MonthYearPicker = dynamic(
  () =>
    import("@/app/[locale]/(main)/calendar/components/MonthYearPicker").then(
      (module) => module.default,
    ),
  { ssr: false },
);

type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type UnitSystem = "metric" | "imperial";
type TranslateFn = ReturnType<typeof useTranslations>;

const FIRST_EFFECTIVE_DATE = "1970-01-01";
const KILOGRAMS_PER_POUND = 0.45359237;
const CENTIMETERS_PER_INCH = 2.54;
const DEFAULT_BIRTH_MONTH = "1995-09";
const CLOUD_TOTAL_STEPS = 8;
const SELF_HOST_TOTAL_STEPS = 8;
const ONBOARDING_STEP_QUERY_PARAM = "step";

const ONBOARDING_STEP_NAMES: Record<OnboardingStep, string> = {
  1: "intro",
  2: "sport",
  3: "display_units",
  4: "basics",
  5: "heart_rate",
  6: "thresholds",
  7: "import",
  8: "ai_data_consent",
  9: "operation_analytics_consent",
};

const ONBOARDING_STEP_SLUGS: Record<OnboardingStep, string> = {
  1: "intro",
  2: "sport",
  3: "display-units",
  4: "basics",
  5: "heart-rate",
  6: "thresholds",
  7: "import",
  8: "ai-data-consent",
  9: "operation-analytics-consent",
};

const ONBOARDING_STEPS_BY_SLUG: Record<string, OnboardingStep> = {
  intro: 1,
  sport: 2,
  "display-units": 3,
  display_units: 3,
  basics: 4,
  "heart-rate": 5,
  heart_rate: 5,
  thresholds: 6,
  import: 7,
  "ai-data-consent": 8,
  ai_data_consent: 8,
  "ai-provider": 8,
  ai_provider: 8,
  "operation-analytics-consent": 9,
  operation_analytics_consent: 9,
};

function getOnboardingStepProperties(
  step: OnboardingStep,
  totalSteps = CLOUD_TOTAL_STEPS,
) {
  return {
    step_name: ONBOARDING_STEP_NAMES[step],
    step_number: step,
    total_steps: totalSteps,
  };
}

function parseOnboardingStepParam(value: string | null): OnboardingStep | null {
  if (!value) return null;

  const step = ONBOARDING_STEPS_BY_SLUG[value.trim().toLowerCase()];
  if (step) return step;

  const numericStep = Number(value);
  return Number.isInteger(numericStep) &&
    numericStep >= 1 &&
    numericStep <= SELF_HOST_TOTAL_STEPS
    ? (numericStep as OnboardingStep)
    : null;
}

function readOnboardingStepFromLocation() {
  if (typeof window === "undefined") return 1;

  return (
    parseOnboardingStepParam(
      new URLSearchParams(window.location.search).get(
        ONBOARDING_STEP_QUERY_PARAM,
      ),
    ) ?? 1
  );
}

function getOnboardingStepUrl(step: OnboardingStep, selfHost = false) {
  const slug =
    step === 8 && selfHost ? "ai-provider" : ONBOARDING_STEP_SLUGS[step];
  if (typeof window === "undefined") {
    return `/onboarding?${ONBOARDING_STEP_QUERY_PARAM}=${slug}`;
  }

  const url = new URL(window.location.href);
  url.searchParams.set(ONBOARDING_STEP_QUERY_PARAM, slug);
  return url.toString();
}

function replaceOnboardingStepUrl(step: OnboardingStep, selfHost = false) {
  if (typeof window === "undefined") return;

  const nextUrl = getOnboardingStepUrl(step, selfHost);
  if (nextUrl === window.location.href) return;
  window.history.replaceState(window.history.state, "", nextUrl);
}

function formatIntegerInput(value: number | null | undefined) {
  return value != null && Number.isFinite(value)
    ? String(Math.round(value))
    : "";
}

function defaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() || "";
  } catch {
    return "";
  }
}

function safeNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function resolveOnboardingUnitSystem(
  savedValue: string | null | undefined,
): UnitSystem {
  if (savedValue === "metric" || savedValue === "imperial") {
    return savedValue;
  }
  if (typeof navigator === "undefined") return "metric";
  const region = navigator.language.split("-")[1]?.toUpperCase();
  return region === "US" ? "imperial" : "metric";
}

function resolveOnboardingPowerUnit(
  savedValue: string | null | undefined,
): PowerUnit {
  return savedValue === "watts_per_kg" ? "watts_per_kg" : "watts";
}

function resolveOnboardingTimeFormat(
  savedValue: string | null | undefined,
): TimeFormat {
  if (savedValue === "12h" || savedValue === "24h") return savedValue;
  if (typeof window === "undefined") return "24h";
  const hourCycle = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
  }).resolvedOptions().hourCycle;
  return hourCycle === "h11" || hourCycle === "h12" ? "12h" : "24h";
}

function formatWeight(value: number) {
  return String(Number(value.toFixed(1)));
}

function formatHeight(value: number) {
  return String(Number(value.toFixed(1)));
}

function weightInputFromKilograms(weight: number, unitSystem: UnitSystem) {
  return formatWeight(
    unitSystem === "imperial" ? weight / KILOGRAMS_PER_POUND : weight,
  );
}

function heightInputFromCentimeters(height: number, unitSystem: UnitSystem) {
  return formatHeight(
    unitSystem === "imperial" ? height / CENTIMETERS_PER_INCH : height,
  );
}

function convertWeightInput(value: string, from: UnitSystem, to: UnitSystem) {
  if (!value.trim() || from === to) return value;
  const numeric = safeNumber(value);
  if (numeric == null || numeric <= 0) return value;
  const kilograms =
    from === "imperial" ? numeric * KILOGRAMS_PER_POUND : numeric;
  return weightInputFromKilograms(kilograms, to);
}

function convertHeightInput(value: string, from: UnitSystem, to: UnitSystem) {
  if (!value.trim() || from === to) return value;
  const numeric = safeNumber(value);
  if (numeric == null || numeric <= 0) return value;
  const centimeters =
    from === "imperial" ? numeric * CENTIMETERS_PER_INCH : numeric;
  return heightInputFromCentimeters(centimeters, to);
}

function birthDateToMonth(value: string | null | undefined) {
  const month = value?.slice(0, 7) ?? "";
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : "";
}

function birthMonthToAge(value: string, today = new Date()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return undefined;
  const [year, month] = value.split("-").map(Number);
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month) age -= 1;
  return age >= 0 && age < 120 ? age : undefined;
}

function birthMonthToDate(value: string) {
  return `${value}-01`;
}

function applyPreferredSportFilters(
  preferredSports: PreferredSport[],
  setters: {
    setActivitiesSportType: (sport: StoreSportType) => void;
    setDashboardSportType: (sport: StoreSportType) => void;
    setMapSportType: (sport: StoreSportType) => void;
    setPmcSportType: (sport: StoreSportType) => void;
    setPowerSportType: (sport: StoreSportType) => void;
  },
) {
  const nextSport =
    preferredSports.length === 1 && preferredSports[0] !== "STRENGTH"
      ? (preferredSports[0] as StoreSportType)
      : "all";
  setters.setDashboardSportType(nextSport);
  setters.setActivitiesSportType(nextSport);
  setters.setPowerSportType(nextSport);
  setters.setPmcSportType(nextSport);
  setters.setMapSportType(nextSport);
}

function StepShell({
  children,
  eyebrow,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  eyebrow: string;
  subtitle?: string;
  title: string;
}) {
  return (
    <section className="rounded-surface bg-muted/45 p-5 text-card-foreground sm:p-6">
      <Badge variant="secondary" className="mb-3 text-muted-foreground">
        {eyebrow}
      </Badge>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {subtitle}
        </p>
      ) : null}
      <div className={subtitle ? "mt-6" : "mt-5"}>{children}</div>
    </section>
  );
}

function Field({
  children,
  description,
  label,
}: {
  children: React.ReactNode;
  description?: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-foreground">{label}</Label>
      {children}
      {description ? (
        <p className="text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function TopProgress({
  currentStep,
  totalSteps,
  t,
}: {
  currentStep: OnboardingStep;
  totalSteps: number;
  t: TranslateFn;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex w-full max-w-[480px] items-center gap-1.5 sm:gap-2">
        {Array.from(
          { length: totalSteps },
          (_, index) => (index + 1) as OnboardingStep,
        ).map((step) => (
          <div
            key={step}
            className={cn(
              "h-1.5 min-w-0 flex-1 rounded-full transition-colors",
              step <= currentStep ? "bg-emerald-500" : "bg-muted",
            )}
          />
        ))}
      </div>
      <div className="text-mobile-caption pc:text-xs font-medium text-muted-foreground">
        {t("progress.count", { current: currentStep, total: totalSteps })}
      </div>
    </div>
  );
}

function Navigation({
  backLabel,
  canNext,
  isSaving,
  nextLabel,
  onBack,
  onNext,
  showBack,
}: {
  backLabel: string;
  canNext: boolean;
  isSaving: boolean;
  nextLabel: string;
  onBack: () => void;
  onNext: () => void;
  showBack: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
      {showBack ? (
        <Button
          variant="outline"
          className="border-border bg-transparent text-foreground hover:bg-muted"
          onClick={onBack}
          disabled={isSaving}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {backLabel}
        </Button>
      ) : (
        <span />
      )}
      <Button onClick={onNext} disabled={!canNext || isSaving}>
        {nextLabel}
        {isSaving ? (
          <Loader2 className="ml-1 h-4 w-4 animate-spin" />
        ) : (
          <ChevronRight className="ml-1 h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

function IntroStep({
  isSaving,
  onContinue,
  t,
}: {
  isSaving: boolean;
  onContinue: () => void;
  t: TranslateFn;
}) {
  const features = [
    { icon: Gauge, key: "load" },
    { icon: HeartPulse, key: "zones" },
    { icon: BarChart3, key: "thresholds" },
    { icon: Brain, key: "ai" },
    { icon: UploadCloud, key: "import" },
    { icon: Activity, key: "plan" },
  ];

  return (
    <section className="mx-auto w-full max-w-5xl text-foreground">
      <div className="max-w-3xl">
        <Badge
          variant="secondary"
          className="mb-4 bg-transparent px-0 text-muted-foreground shadow-none"
        >
          {t("intro.badge")}
        </Badge>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {t("intro.title")}
        </h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          {t("intro.subtitle")}
        </p>
      </div>

      <div className="mt-7 rounded-surface bg-muted/55 p-5 sm:p-6">
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.key} className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {t(`intro.features.${feature.key}.title`)}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {t(`intro.features.${feature.key}.description`)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button
          size="lg"
          className="min-w-32 bg-foreground px-6 text-background hover:bg-foreground/90"
          disabled={isSaving}
          onClick={onContinue}
        >
          {t("buttons.getStarted")}
          {isSaving ? (
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
          ) : (
            <ChevronRight className="ml-2 h-4 w-4" />
          )}
        </Button>
      </div>
    </section>
  );
}

function ChoiceGroup<Value extends string>({
  disabled = false,
  options,
  value,
  onChange,
}: {
  disabled?: boolean;
  options: Array<{ label: string; value: Value }>;
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
      role="radiogroup"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            role="radio"
            aria-checked={selected}
            className={cn(
              "min-h-9 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function DisplayUnitsStep({
  disabled,
  powerUnit,
  settingsT,
  setPowerUnit,
  setTimeFormat,
  setUnitSystem,
  t,
  timeFormat,
  timezone,
  unitSystem,
}: {
  disabled: boolean;
  powerUnit: PowerUnit;
  settingsT: TranslateFn;
  setPowerUnit: (value: PowerUnit) => void;
  setTimeFormat: (value: TimeFormat) => void;
  setUnitSystem: (value: UnitSystem) => void;
  t: TranslateFn;
  timeFormat: TimeFormat;
  timezone: string;
  unitSystem: UnitSystem;
}) {
  return (
    <StepShell
      eyebrow={t("displayUnits.eyebrow")}
      title={t("displayUnits.title")}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Field
          label={settingsT("unitSystem")}
          description={settingsT("unitSystemDescription")}
        >
          <ChoiceGroup
            disabled={disabled}
            options={[
              { label: settingsT("metric"), value: "metric" },
              { label: settingsT("imperial"), value: "imperial" },
            ]}
            value={unitSystem}
            onChange={setUnitSystem}
          />
        </Field>
        <Field
          label={settingsT("powerUnit")}
          description={settingsT("powerUnitDescription")}
        >
          <ChoiceGroup
            disabled={disabled}
            options={[
              { label: settingsT("watts"), value: "watts" },
              {
                label: settingsT("wattsPerKilogram"),
                value: "watts_per_kg",
              },
            ]}
            value={powerUnit}
            onChange={setPowerUnit}
          />
        </Field>
        <Field
          label={settingsT("timeFormat")}
          description={settingsT("timeFormatDescription")}
        >
          <ChoiceGroup
            disabled={disabled}
            options={[
              { label: settingsT("timeFormat24h"), value: "24h" },
              { label: settingsT("timeFormat12h"), value: "12h" },
            ]}
            value={timeFormat}
            onChange={setTimeFormat}
          />
        </Field>
      </div>
      <p className="mt-4 rounded-control-lg bg-background/70 px-4 py-3 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
        {t("displayUnits.timezoneHint", { timezone })}
      </p>
    </StepShell>
  );
}

function SportStep({
  preferredSports,
  setPreferredSports,
  t,
}: {
  preferredSports: PreferredSport[];
  setPreferredSports: (sports: PreferredSport[]) => void;
  t: TranslateFn;
}) {
  const options = [
    { icon: Footprints, value: "RUN" as const },
    { icon: Bike, value: "CYCLING" as const },
    { icon: Waves, value: "SWIM" as const },
    { icon: Dumbbell, value: "STRENGTH" as const },
  ];

  return (
    <StepShell
      eyebrow={t("step1.eyebrow")}
      title={t("step1.title")}
      subtitle={t("step1.subtitle")}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {options.map((option) => {
          const Icon = option.icon;
          const selected = preferredSports.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={cn(
                "rounded-control-lg p-4 text-left transition-colors",
                selected
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/70 hover:bg-background",
              )}
              onClick={() => {
                setPreferredSports(
                  selected
                    ? preferredSports.filter((sport) => sport !== option.value)
                    : [...preferredSports, option.value],
                );
              }}
            >
              <Icon className="h-6 w-6" />
              <div className="mt-4 text-sm font-semibold">
                {t(`step1.sports.${option.value}.title`)}
              </div>
              <p
                className={cn(
                  "mt-1 text-mobile-caption pc:text-xs leading-5",
                  selected
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground",
                )}
              >
                {t(`step1.sports.${option.value}.description`)}
              </p>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}

function BasicsStep({
  birthMonth,
  height,
  setBirthMonth,
  setHeight,
  setWeight,
  t,
  unitSystem,
  weight,
}: {
  birthMonth: string;
  height: string;
  setBirthMonth: (value: string) => void;
  setHeight: (value: string) => void;
  setWeight: (value: string) => void;
  t: TranslateFn;
  unitSystem: UnitSystem;
  weight: string;
}) {
  const [birthMonthPickerOpen, setBirthMonthPickerOpen] = useState(false);
  const birthMonthDate = birthMonth
    ? new Date(
        Number(birthMonth.slice(0, 4)),
        Number(birthMonth.slice(5, 7)) - 1,
        1,
      )
    : new Date(1995, 8, 1);

  return (
    <StepShell eyebrow={t("step2.eyebrow")} title={t("step2.title")}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label={t("fields.birthMonth.label")}
          description={t("fields.birthMonth.help")}
        >
          <Popover
            open={birthMonthPickerOpen}
            onOpenChange={setBirthMonthPickerOpen}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-between font-normal",
                  !birthMonth && "text-muted-foreground",
                )}
              >
                <span>{birthMonth || t("fields.birthMonth.placeholder")}</span>
                <CalendarDays className="h-4 w-4 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <MonthYearPicker
                key={birthMonth || "empty"}
                value={birthMonthDate}
                fromYear={new Date().getFullYear() - 100}
                toYear={new Date().getFullYear() - 8}
                onChange={(date) => {
                  setBirthMonth(
                    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
                  );
                  setBirthMonthPickerOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </Field>
        <Field
          label={t("fields.weight.label")}
          description={t("fields.weight.help")}
        >
          <div className="relative">
            <Input
              className="pr-14"
              inputMode="decimal"
              min={1}
              type="number"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              placeholder={
                unitSystem === "metric" ? t("fields.weight.placeholder") : "154"
              }
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
              {unitSystem === "metric" ? "kg" : "lb"}
            </span>
          </div>
        </Field>
        <Field
          label={t("fields.height.label")}
          description={t("fields.height.help")}
        >
          <div className="relative">
            <Input
              className="pr-14"
              inputMode="decimal"
              min={1}
              type="number"
              value={height}
              onChange={(event) => setHeight(event.target.value)}
              placeholder={
                unitSystem === "metric" ? t("fields.height.placeholder") : "69"
              }
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
              {unitSystem === "metric" ? "cm" : "in"}
            </span>
          </div>
        </Field>
      </div>
    </StepShell>
  );
}

function HeartRateStep({
  birthMonth,
  maxHR,
  restHR,
  setMaxHR,
  setRestHR,
  t,
}: {
  birthMonth: string;
  maxHR: string;
  restHR: string;
  setMaxHR: (value: string) => void;
  setRestHR: (value: string) => void;
  t: TranslateFn;
}) {
  const ageNum = useMemo(() => birthMonthToAge(birthMonth), [birthMonth]);
  const estimatedMaxHR = useMemo(
    () => getEstimatedMaxHeartRate(ageNum),
    [ageNum],
  );
  const estimatedRestHR = useMemo(
    () => getEstimatedRestHeartRate(ageNum),
    [ageNum],
  );

  return (
    <StepShell eyebrow={t("step3.eyebrow")} title={t("step3.title")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("fields.maxHR.label")}
          description={t("fields.maxHR.help")}
        >
          <Input
            inputMode="numeric"
            min={80}
            max={240}
            type="number"
            value={maxHR}
            onChange={(event) => setMaxHR(event.target.value)}
            placeholder={t("fields.maxHR.placeholder")}
          />
        </Field>
        <Field
          label={t("fields.restHR.label")}
          description={t("fields.restHR.help")}
        >
          <Input
            inputMode="numeric"
            min={30}
            max={120}
            type="number"
            value={restHR}
            onChange={(event) => setRestHR(event.target.value)}
            placeholder={t("fields.restHR.placeholder")}
          />
        </Field>
      </div>
      <div className="mt-4 rounded-lg bg-background/75 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold">
              {t("step3.estimate.title")}
            </div>
            <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
              {ageNum
                ? t("step3.estimate.ready", {
                    max: estimatedMaxHR ?? "-",
                    rest: estimatedRestHR ?? "-",
                  })
                : t("step3.estimate.empty")}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={!ageNum}
            onClick={() => {
              if (estimatedMaxHR != null) setMaxHR(String(estimatedMaxHR));
              if (estimatedRestHR != null) setRestHR(String(estimatedRestHR));
            }}
          >
            {t("buttons.applyEstimate")}
          </Button>
        </div>
      </div>
    </StepShell>
  );
}

function ThresholdStep({
  cyclingFtp,
  preferredSports,
  runFtp,
  setCyclingFtp,
  setRunFtp,
  t,
}: {
  cyclingFtp: string;
  preferredSports: PreferredSport[];
  runFtp: string;
  setCyclingFtp: (value: string) => void;
  setRunFtp: (value: string) => void;
  t: TranslateFn;
}) {
  const showRun = preferredSports.includes("RUN");
  const showCycling = preferredSports.includes("CYCLING");
  const showNoPowerThresholds = !showRun && !showCycling;

  return (
    <StepShell eyebrow={t("step4.eyebrow")} title={t("step4.title")}>
      <div className="grid gap-4 sm:grid-cols-2">
        {showRun ? (
          <Field
            label={t("fields.runFtp.label")}
            description={t("fields.runFtp.help")}
          >
            <Input
              inputMode="numeric"
              min={50}
              max={600}
              type="number"
              value={runFtp}
              onChange={(event) => setRunFtp(event.target.value)}
              placeholder={t("fields.runFtp.placeholder")}
            />
          </Field>
        ) : null}
        {showCycling ? (
          <Field
            label={t("fields.cyclingFtp.label")}
            description={t("fields.cyclingFtp.help")}
          >
            <Input
              inputMode="numeric"
              min={50}
              max={600}
              type="number"
              value={cyclingFtp}
              onChange={(event) => setCyclingFtp(event.target.value)}
              placeholder={t("fields.cyclingFtp.placeholder")}
            />
          </Field>
        ) : null}
        {showNoPowerThresholds ? (
          <div className="rounded-lg bg-background/75 p-4 text-sm text-muted-foreground sm:col-span-2">
            {t("step4.swimOnly")}
          </div>
        ) : null}
      </div>
    </StepShell>
  );
}

function AiConsentStep({
  acceptDisabled,
  backLabel,
  busy,
  error,
  recipient,
  t,
  onAccept,
  onBack,
  onDecline,
}: {
  acceptDisabled: boolean;
  backLabel: string;
  busy: boolean;
  error: string | null;
  recipient: string;
  t: TranslateFn;
  onAccept: () => void;
  onBack: () => void;
  onDecline: () => void;
}) {
  return (
    <StepShell eyebrow={t("recipientLabel")} title={t("title")}>
      <AiDataConsentDisclosure recipient={recipient} />
      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onBack}
        >
          <ChevronLeft className="mr-1 size-4" aria-hidden="true" />
          {backLabel}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onDecline}
          >
            {t("decline")}
          </Button>
          <Button
            type="button"
            disabled={busy || acceptDisabled}
            onClick={onAccept}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {t("accept")}
          </Button>
        </div>
      </div>
    </StepShell>
  );
}

function SelfHostAiStep({
  backLabel,
  busy,
  error,
  onBack,
  onConfigured,
  onPendingChange,
  onSkip,
  t,
}: {
  backLabel: string;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onConfigured: (result: SelfHostAiConfigurationResult) => void;
  onPendingChange: (pending: boolean) => void;
  onSkip: () => void;
  t: TranslateFn;
}) {
  const settingsT = useTranslations("SelfHostAiSettings");

  return (
    <StepShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      subtitle={t("subtitle")}
    >
      <SelfHostAiSettings
        surface="onboarding"
        onConfigured={onConfigured}
        onPendingChange={onPendingChange}
        renderActions={({ busy: formBusy, canSubmit }) => (
          <>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              {t("dataNotice")}
            </p>
            {error ? (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={busy || formBusy}
                onClick={onBack}
              >
                <ChevronLeft className="mr-1 size-4" aria-hidden="true" />
                {backLabel}
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || formBusy}
                  onClick={onSkip}
                >
                  {t("skip")}
                </Button>
                <Button type="submit" disabled={busy || formBusy || !canSubmit}>
                  {busy || formBusy ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  {settingsT(
                    busy || formBusy ? "onboardingSaving" : "onboardingSave",
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      />
    </StepShell>
  );
}

export function OnboardingPageClient() {
  const t = useTranslations("OnboardingPage");
  const aiConsentT = useTranslations("AiDataConsent");
  const selfHostAiT = useTranslations("SelfHostAiOnboarding");
  const locale = useLocale();
  const settingsT = useTranslations("settings");
  const router = useRouter();
  const queryClient = useQueryClient();
  const runtimeCapabilities = useRuntimeCapabilities();
  const isSelfHost =
    runtimeCapabilities.data?.deployment === "self-host" ||
    Boolean(process.env.NEXT_PUBLIC_SELF_HOST_MODE);
  const totalSteps = isSelfHost ? SELF_HOST_TOTAL_STEPS : CLOUD_TOTAL_STEPS;
  const [step, setStep] = useState<OnboardingStep>(
    readOnboardingStepFromLocation,
  );
  const { mutateAsync: markNotNew } = useChangeIsNewUser(false);
  const aiConsent = useAiDataConsent({ enabled: !isSelfHost });
  const updateAiConsent = useUpdateAiDataConsent();
  const { data: profile } = useUserProfile(undefined, step >= 2);
  const { data: runProfile } = useUserProfile(ApiSportType.RUN, step >= 6);
  const { data: cyclingProfile } = useUserProfile(
    ApiSportType.CYCLING,
    step >= 6,
  );
  const settingsQuery = useQuery({
    queryKey: queryKeys.me.userSettings(),
    queryFn: getUserSettings,
    enabled: step >= 3,
  });
  const {
    setActivitiesSportType,
    setDashboardSportType,
    setMapSportType,
    setPmcSportType,
    setPowerSportType,
    updateSetting,
  } = useStore();

  const [preferredSports, setPreferredSports] = useState<PreferredSport[]>([]);
  const [birthMonth, setBirthMonth] = useState(DEFAULT_BIRTH_MONTH);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("metric");
  const [powerUnit, setPowerUnit] = useState<PowerUnit>("watts");
  const [timeFormat, setTimeFormat] = useState<TimeFormat>("24h");
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [maxHR, setMaxHR] = useState("");
  const [restHR, setRestHR] = useState("");
  const [runFtp, setRunFtp] = useState("");
  const [cyclingFtp, setCyclingFtp] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSelfHostAiSaving, setIsSelfHostAiSaving] = useState(false);
  const [aiConsentError, setAiConsentError] = useState<string | null>(null);
  const [setupSkipped, setSetupSkipped] = useState(false);
  const [completionMethod, setCompletionMethod] = useState<
    "skip" | "upload_later" | "uploaded" | "connected_provider"
  >("skip");
  const [hasUploadedImport, setHasUploadedImport] = useState(false);
  const [hasConnectedImportProvider, setHasConnectedImportProvider] =
    useState(false);
  const [completionPayload, setCompletionPayload] = useState<unknown>();
  const hasTrackedStartedRef = useRef(false);
  const hasTrackedAiConsentStepRef = useRef(false);
  const hasHydratedSettingsRef = useRef(false);
  const hasHydratedProfileRef = useRef(false);
  const hasHydratedRunProfileRef = useRef(false);
  const hasHydratedCyclingProfileRef = useRef(false);
  const aiConsentDecisionInFlightRef = useRef(false);
  const hasContinuedRef = useRef(false);

  useSetPageTitle(t("intro.title"));

  useEffect(() => {
    if (hasTrackedStartedRef.current) return;

    hasTrackedStartedRef.current = true;
    track("onboarding_started", getOnboardingStepProperties(step, totalSteps));
  }, [step, totalSteps]);

  useEffect(() => {
    track(
      "onboarding_step_viewed",
      getOnboardingStepProperties(step, totalSteps),
    );
  }, [step, totalSteps]);

  useEffect(() => {
    if (
      isSelfHost ||
      step !== CLOUD_TOTAL_STEPS ||
      hasTrackedAiConsentStepRef.current ||
      !aiConsent.data
    ) {
      return;
    }
    hasTrackedAiConsentStepRef.current = true;
    track("ai_consent_step_viewed", {
      source: "ONBOARDING",
      version: aiConsent.data.version,
      provider: aiConsent.data.provider,
    });
  }, [aiConsent.data, isSelfHost, step]);

  useEffect(() => {
    if (runtimeCapabilities.isLoading || isSelfHost || step !== 9) return;
    setStep(8);
    replaceOnboardingStepUrl(8, false);
  }, [isSelfHost, runtimeCapabilities.isLoading, step]);

  useEffect(() => {
    const onPopState = () => {
      setStep(readOnboardingStepFromLocation());
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!settingsQuery.isFetched || hasHydratedSettingsRef.current) return;

    hasHydratedSettingsRef.current = true;
    setUnitSystem(resolveOnboardingUnitSystem(settingsQuery.data?.UNIT_SYSTEM));
    setPowerUnit(resolveOnboardingPowerUnit(settingsQuery.data?.POWER_UNIT));
    setTimeFormat(resolveOnboardingTimeFormat(settingsQuery.data?.TIME_FORMAT));
    setSettingsHydrated(true);
  }, [settingsQuery.data, settingsQuery.isFetched]);

  useEffect(() => {
    if (!profile || hasHydratedProfileRef.current) return;
    if (!settingsHydrated) return;

    hasHydratedProfileRef.current = true;
    setPreferredSports((current) =>
      current.length || !profile.preferredSports?.length
        ? current
        : profile.preferredSports,
    );
    setBirthMonth((current) => birthDateToMonth(profile.birthDate) || current);
    setWeight(
      (current) =>
        current ||
        (profile.weight != null
          ? weightInputFromKilograms(profile.weight, unitSystem)
          : ""),
    );
    setHeight(
      (current) =>
        current ||
        (profile.height != null
          ? heightInputFromCentimeters(profile.height, unitSystem)
          : ""),
    );
    setTimezone(profile.timezone || defaultTimezone());
    setMaxHR((current) => current || formatIntegerInput(profile.maxHeartRate));
    setRestHR(
      (current) => current || formatIntegerInput(profile.restingHeartRate),
    );
  }, [profile, settingsHydrated, unitSystem]);

  useEffect(() => {
    if (!runProfile || hasHydratedRunProfileRef.current) return;

    hasHydratedRunProfileRef.current = true;
    setRunFtp((current) => current || formatIntegerInput(runProfile.ftp));
  }, [runProfile]);

  useEffect(() => {
    if (!cyclingProfile || hasHydratedCyclingProfileRef.current) return;

    hasHydratedCyclingProfileRef.current = true;
    setCyclingFtp(
      (current) => current || formatIntegerInput(cyclingProfile.ftp),
    );
  }, [cyclingProfile]);

  const goToStep = (nextStep: OnboardingStep) => {
    setStep(nextStep);
    replaceOnboardingStepUrl(nextStep, isSelfHost);
  };

  const continueToHome = useCallback(() => {
    if (hasContinuedRef.current) return;
    hasContinuedRef.current = true;
    setCompletionPayload(undefined);
    router.replace(getOnboardingNextPathFromLocation());
  }, [router]);

  const handleUnitSystemChange = (nextUnitSystem: UnitSystem) => {
    if (nextUnitSystem === unitSystem) return;
    setWeight((current) =>
      convertWeightInput(current, unitSystem, nextUnitSystem),
    );
    setHeight((current) =>
      convertHeightInput(current, unitSystem, nextUnitSystem),
    );
    setUnitSystem(nextUnitSystem);
  };

  const canNext = useMemo(() => {
    if (step === 1) return true;
    if (step === 2) return preferredSports.length > 0;
    if (step === 3) return settingsHydrated;
    if (step === 4) return true;
    if (step === 5) return canProceedFromStep2({ maxHR, restHR });
    if (step === 6) return true;
    return false;
  }, [maxHR, preferredSports.length, restHR, settingsHydrated, step]);
  const finishOnboarding = async (
    completedVia: "skip" | "upload_later" | "uploaded" | "connected_provider",
    savedConsent: AiDataConsentStatus,
  ) => {
    try {
      setIsSaving(true);
      const result = await markNotNew();
      queryClient.invalidateQueries({ queryKey: queryKeys.root.userProfile });
      track("onboarding_completed", {
        ...getOnboardingStepProperties(totalSteps, totalSteps),
        completion_method: completedVia,
        setup_skipped: setupSkipped,
        ai_enabled: savedConsent.granted,
        ai_consent_version: savedConsent.version,
      });
      toast.success(t("done.toast"));
      setCompletionPayload(result);
    } catch (error) {
      track("onboarding_failed", {
        ...getOnboardingStepProperties(step, totalSteps),
        action: "complete",
        completion_method: completedVia,
        error_name: error instanceof Error ? error.name : "UnknownError",
      });
      console.error("Failed to finish onboarding:", error);
      toast.error(error instanceof Error ? error.message : t("errors.save"));
    } finally {
      setIsSaving(false);
    }
  };

  const decideAiConsent = async (granted: boolean) => {
    if (aiConsentDecisionInFlightRef.current) return;
    aiConsentDecisionInFlightRef.current = true;
    setAiConsentError(null);
    setIsSaving(true);
    try {
      const savedConsent = await updateAiConsent.mutateAsync({
        granted,
        source: "ONBOARDING",
        locale,
      });
      track("onboarding_step_completed", {
        ...getOnboardingStepProperties(CLOUD_TOTAL_STEPS, totalSteps),
        granted,
      });
      await finishOnboarding(completionMethod, savedConsent);
    } catch (error) {
      setAiConsentError(
        isSelfHost ? selfHostAiT("error") : aiConsentT("error"),
      );
      track("onboarding_failed", {
        ...getOnboardingStepProperties(step, totalSteps),
        action: "save_ai_consent",
        error_name: error instanceof Error ? error.name : "UnknownError",
      });
    } finally {
      aiConsentDecisionInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const finishSelfHostAiSetup = async (
    result: SelfHostAiConfigurationResult,
  ) => {
    setAiConsentError(null);
    track("onboarding_step_completed", {
      ...getOnboardingStepProperties(8, totalSteps),
      ai_enabled: result.enabled,
      provider: result.provider,
    });
    await finishOnboarding(completionMethod, result.consent);
  };

  const skipSelfHostAiSetup = async () => {
    setAiConsentError(null);
    setIsSaving(true);
    try {
      const consent = await fetchAiDataConsentStatus();
      if (!consent) throw new Error(selfHostAiT("error"));
      track("onboarding_step_completed", {
        ...getOnboardingStepProperties(8, totalSteps),
        skipped: true,
        ai_enabled: consent.granted,
        provider: consent.provider,
      });
      await finishOnboarding(completionMethod, consent);
    } catch (error) {
      setAiConsentError(selfHostAiT("error"));
      track("onboarding_failed", {
        ...getOnboardingStepProperties(step, totalSteps),
        action: "skip_self_host_ai_setup",
        error_name: error instanceof Error ? error.name : "UnknownError",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const skipToAiConsent = () => {
    setSetupSkipped(true);
    setCompletionMethod("skip");
    track("onboarding_step_completed", {
      ...getOnboardingStepProperties(step, totalSteps),
      skipped: true,
    });
    goToStep(CLOUD_TOTAL_STEPS);
  };

  const saveBasics = async () => {
    const promises: Array<Promise<unknown>> = [];
    const enteredWeight = safeNumber(weight);
    const enteredHeight = safeNumber(height);
    const weightNum =
      enteredWeight == null
        ? undefined
        : unitSystem === "imperial"
          ? enteredWeight * KILOGRAMS_PER_POUND
          : enteredWeight;
    const heightNum =
      enteredHeight == null
        ? undefined
        : unitSystem === "imperial"
          ? enteredHeight * CENTIMETERS_PER_INCH
          : enteredHeight;
    if (birthMonth) {
      const age = birthMonthToAge(birthMonth);
      if (age == null || age < 8 || age > 100) {
        throw new Error(t("errors.birthMonth"));
      }
      promises.push(
        replaceUserBodyMetrics(BodyMetricTypes.BIRTHDAY, [
          {
            effectiveDate: FIRST_EFFECTIVE_DATE,
            value: birthMonthToDate(birthMonth),
          },
        ]),
      );
    }
    if (weightNum != null && weightNum > 0) {
      promises.push(
        replaceUserBodyMetrics(BodyMetricTypes.WEIGHT, [
          { effectiveDate: FIRST_EFFECTIVE_DATE, value: String(weightNum) },
        ]),
      );
    }
    if (heightNum != null) {
      if (heightNum < 80 || heightNum > 260) {
        throw new Error(t("errors.height"));
      }
      promises.push(
        replaceUserBodyMetrics(BodyMetricTypes.HEIGHT, [
          {
            effectiveDate: FIRST_EFFECTIVE_DATE,
            value: String(Number(heightNum.toFixed(2))),
          },
        ]),
      );
    }
    if (timezone.trim()) {
      promises.push(updateUserProfile({ timezone: timezone.trim() }));
    }
    await Promise.all(promises);
  };

  const saveDisplaySettings = async () => {
    await Promise.all([
      updateSetting("unit_system", unitSystem),
      updateSetting("power_unit", powerUnit),
      updateSetting("time_format", timeFormat),
    ]);
    await queryClient.invalidateQueries({
      queryKey: queryKeys.me.userSettings(),
    });
  };

  const saveHeartRate = async () => {
    await Promise.all([
      replaceUserFitnessMetricManualHistory(
        "MAX_HR",
        [{ effectiveDate: FIRST_EFFECTIVE_DATE, value: String(Number(maxHR)) }],
        ApiSportType.UNKNOWN,
      ),
      replaceUserFitnessMetricManualHistory(
        "RESTING_HR",
        [
          {
            effectiveDate: FIRST_EFFECTIVE_DATE,
            value: String(Number(restHR)),
          },
        ],
        ApiSportType.UNKNOWN,
      ),
    ]);
  };

  const saveThresholds = async () => {
    const promises: Array<Promise<unknown>> = [];
    const runFtpNum = safeNumber(runFtp);
    const cyclingFtpNum = safeNumber(cyclingFtp);
    if (runFtpNum != null && runFtpNum >= 50 && runFtpNum <= 600) {
      promises.push(
        replaceUserFitnessMetricManualHistory(
          "FTP",
          [{ effectiveDate: FIRST_EFFECTIVE_DATE, value: String(runFtpNum) }],
          ApiSportType.RUN,
        ),
      );
    }
    if (cyclingFtpNum != null && cyclingFtpNum >= 50 && cyclingFtpNum <= 600) {
      promises.push(
        replaceUserFitnessMetricManualHistory(
          "FTP",
          [
            {
              effectiveDate: FIRST_EFFECTIVE_DATE,
              value: String(cyclingFtpNum),
            },
          ],
          ApiSportType.CYCLING,
        ),
      );
    }
    await Promise.all(promises);
  };

  const handleNext = async () => {
    if (!canNext) return;
    try {
      setIsSaving(true);
      if (step === 2) {
        applyPreferredSportFilters(preferredSports, {
          setActivitiesSportType,
          setDashboardSportType,
          setMapSportType,
          setPmcSportType,
          setPowerSportType,
        });
        await updateUserProfile({ preferredSports });
      }
      if (step === 3) await saveDisplaySettings();
      if (step === 4) await saveBasics();
      if (step === 5) await saveHeartRate();
      if (step === 6) await saveThresholds();
      track("onboarding_step_completed", {
        ...getOnboardingStepProperties(step, totalSteps),
        preferred_sports_count: preferredSports.length,
      });
      if (step < 7) {
        goToStep((step + 1) as OnboardingStep);
      }
      if (step >= 2) {
        queryClient.invalidateQueries({ queryKey: queryKeys.root.userProfile });
      }
    } catch (error) {
      track("onboarding_failed", {
        ...getOnboardingStepProperties(step, totalSteps),
        action: "save_step",
        error_name: error instanceof Error ? error.name : "UnknownError",
      });
      console.error("Failed to save onboarding step:", error);
      toast.error(error instanceof Error ? error.message : t("errors.save"));
    } finally {
      setIsSaving(false);
    }
  };

  const onUploaded = () => {
    track(
      "onboarding_import_uploaded",
      getOnboardingStepProperties(7, totalSteps),
    );
    void invalidateActivityDerivedCaches(queryClient);
    setHasUploadedImport(true);
  };

  return (
    <div className="min-h-dvh-safe bg-background text-foreground">
      <TopBar />
      <main className="overflow-y-auto">
        <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-7xl flex-col px-safe-or-3 py-3 gap-3">
          <div className="grid shrink-0 grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <span />
            <TopProgress currentStep={step} totalSteps={totalSteps} t={t} />
            <div className="flex justify-start sm:justify-end">
              {step < CLOUD_TOTAL_STEPS ? (
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:bg-muted hover:text-foreground"
                  disabled={isSaving}
                  onClick={skipToAiConsent}
                >
                  {t("buttons.skipSetup")}
                </Button>
              ) : null}
            </div>
          </div>

          <div
            className={cn(
              "flex flex-1 flex-col",
              step === 1 ? "pt-2 sm:pt-3" : "pt-4 sm:pt-8",
            )}
          >
            {step === 1 ? (
              <IntroStep
                isSaving={isSaving}
                onContinue={() => void handleNext()}
                t={t}
              />
            ) : (
              <>
                <div className="mx-auto w-full max-w-4xl">
                  {step <= 7 ? (
                    <p className="mb-4 text-sm text-muted-foreground">
                      {t("setupHint")}
                    </p>
                  ) : null}
                  {step === 2 ? (
                    <SportStep
                      preferredSports={preferredSports}
                      setPreferredSports={setPreferredSports}
                      t={t}
                    />
                  ) : null}
                  {step === 3 ? (
                    <DisplayUnitsStep
                      disabled={!settingsHydrated}
                      powerUnit={powerUnit}
                      settingsT={settingsT}
                      setPowerUnit={setPowerUnit}
                      setTimeFormat={setTimeFormat}
                      setUnitSystem={handleUnitSystemChange}
                      t={t}
                      timeFormat={timeFormat}
                      timezone={timezone}
                      unitSystem={unitSystem}
                    />
                  ) : null}
                  {step === 4 ? (
                    <BasicsStep
                      birthMonth={birthMonth}
                      height={height}
                      setBirthMonth={setBirthMonth}
                      setHeight={setHeight}
                      setWeight={setWeight}
                      t={t}
                      unitSystem={unitSystem}
                      weight={weight}
                    />
                  ) : null}
                  {step === 5 ? (
                    <HeartRateStep
                      birthMonth={birthMonth}
                      maxHR={maxHR}
                      restHR={restHR}
                      setMaxHR={setMaxHR}
                      setRestHR={setRestHR}
                      t={t}
                    />
                  ) : null}
                  {step === 6 ? (
                    <ThresholdStep
                      cyclingFtp={cyclingFtp}
                      preferredSports={preferredSports}
                      runFtp={runFtp}
                      setCyclingFtp={setCyclingFtp}
                      setRunFtp={setRunFtp}
                      t={t}
                    />
                  ) : null}
                  {step === 7 ? (
                    <OnboardingImportStep
                      onConnectionStatusChange={setHasConnectedImportProvider}
                      onUploaded={onUploaded}
                    />
                  ) : null}
                  {step === 8 ? (
                    isSelfHost ? (
                      <SelfHostAiStep
                        backLabel={t("buttons.back")}
                        busy={
                          isSaving ||
                          isSelfHostAiSaving ||
                          updateAiConsent.isPending
                        }
                        error={aiConsentError}
                        onBack={() => goToStep(7)}
                        onConfigured={(result) =>
                          void finishSelfHostAiSetup(result)
                        }
                        onPendingChange={setIsSelfHostAiSaving}
                        onSkip={() => void skipSelfHostAiSetup()}
                        t={selfHostAiT}
                      />
                    ) : (
                      <AiConsentStep
                        acceptDisabled={
                          aiConsent.isLoading ||
                          !aiConsent.data ||
                          aiConsent.data.state === "UNAVAILABLE"
                        }
                        backLabel={t("buttons.back")}
                        busy={isSaving || updateAiConsent.isPending}
                        error={aiConsentError}
                        recipient={
                          aiConsent.data?.provider
                            ? aiConsent.data.recipient
                            : aiConsentT("recipientUnknown")
                        }
                        t={aiConsentT}
                        onAccept={() => void decideAiConsent(true)}
                        onBack={() => goToStep(7)}
                        onDecline={() => void decideAiConsent(false)}
                      />
                    )
                  ) : null}

                  {step < CLOUD_TOTAL_STEPS ? (
                    <Navigation
                      backLabel={t("buttons.back")}
                      canNext={step === 7 ? true : canNext}
                      isSaving={isSaving}
                      nextLabel={
                        step === 7
                          ? t("buttons.toAiConsent")
                          : step === 6
                            ? t("buttons.toImport")
                            : t("buttons.next")
                      }
                      onBack={() =>
                        goToStep(Math.max(1, step - 1) as OnboardingStep)
                      }
                      onNext={() => {
                        if (step === 7) {
                          const method = hasUploadedImport
                            ? "uploaded"
                            : hasConnectedImportProvider
                              ? "connected_provider"
                              : "upload_later";
                          setCompletionMethod(method);
                          track(
                            "onboarding_step_completed",
                            getOnboardingStepProperties(7, totalSteps),
                          );
                          goToStep(8);
                          return;
                        }
                        void handleNext();
                      }}
                      showBack={step > 2}
                    />
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
      {completionPayload !== undefined ? (
        <OnboardingCompletionExtension
          payload={completionPayload}
          onContinue={continueToHome}
        />
      ) : null}
    </div>
  );
}
