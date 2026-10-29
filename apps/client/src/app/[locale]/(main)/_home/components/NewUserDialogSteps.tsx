"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Bike, Gauge, HeartPulse, Info } from "lucide-react";
import type {
  NewUserDialogStep,
  NewUserSportOption,
  PreferredSport,
} from "./new-user-dialog-model";

type TranslateFn = (key: string) => string;

export function NewUserDialogStepIndicator({
  step,
  t,
}: {
  step: NewUserDialogStep;
  t: TranslateFn;
}) {
  return (
    <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2">
      {([1, 2, 3] as NewUserDialogStep[]).map((item) => (
        <div
          key={item}
          className={cn(
            "flex items-center gap-2 px-2 py-1 rounded-full border text-mobile-caption pc:text-xs",
            step === item
              ? "border-neutral-300 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800"
              : "border-transparent bg-transparent text-muted-foreground",
          )}
        >
          <Badge variant={step === item ? "outline" : "secondary"}>
            {item}
          </Badge>
          <span className={cn("hidden sm:inline", step === item && "inline")}>
            {item === 1
              ? t("steps.step1Label")
              : item === 2
                ? t("steps.step2Label")
                : t("steps.step3Label")}
          </span>
        </div>
      ))}
    </div>
  );
}

export function NewUserDialogStep1({
  canNext,
  onNext,
  onSkip,
  onToggleSport,
  preferredSports,
  sportOptions,
  t,
}: {
  canNext: boolean;
  onNext: () => void;
  onSkip: () => void;
  onToggleSport: (sport: PreferredSport) => void;
  preferredSports: PreferredSport[];
  sportOptions: NewUserSportOption[];
  t: TranslateFn;
}) {
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">{t("selectPreferredSports")}</div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {sportOptions.map((option) => {
          const selected = preferredSports.includes(option.value);
          const Icon = option.icon;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggleSport(option.value)}
              className={cn(
                "flex items-center gap-3 p-3 rounded-md border transition-colors",
                "bg-neutral-50 dark:bg-neutral-800/30 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                selected
                  ? "border-primary ring-2 ring-primary/40 bg-primary/5"
                  : "border-neutral-200 dark:border-neutral-700",
              )}
            >
              <div className={cn("text-primary", selected && "text-primary")}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold flex items-center gap-2">
                  {option.label}
                  {selected ? (
                    <Badge variant="outline" className="text-mobile-unit pc:text-[10px]">
                      {t("selected")}
                    </Badge>
                  ) : null}
                </div>
                {option.desc ? (
                  <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                    {option.desc}
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="text-mobile-caption pc:text-xs text-muted-foreground pt-1">
        {t("settings.hintAdjust")}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button size="sm" variant="ghost" onClick={onSkip}>
          {t("buttons.skip")}
        </Button>
        <Button size="sm" onClick={onNext} disabled={!canNext}>
          {t("buttons.next")}
        </Button>
      </div>
    </div>
  );
}

export function NewUserDialogStep2({
  age,
  canNext,
  estimatedMaxHR,
  estimatedRestHR,
  maxHR,
  onAgeChange,
  onApplyEstimate,
  onBack,
  onMaxHRChange,
  onNext,
  onRestHRChange,
  onSkip,
  restHR,
  t,
}: {
  age: string;
  canNext: boolean;
  estimatedMaxHR?: number;
  estimatedRestHR?: number;
  maxHR: string;
  onAgeChange: (value: string) => void;
  onApplyEstimate: () => void;
  onBack: () => void;
  onMaxHRChange: (value: string) => void;
  onNext: () => void;
  onRestHRChange: (value: string) => void;
  onSkip: () => void;
  restHR: string;
  t: TranslateFn;
}) {
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium flex items-center gap-2">
        <HeartPulse className="w-4 h-4" /> {t("step2.title")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="max-hr">{t("inputs.maxHR.label")}</Label>
          <Input
            id="max-hr"
            type="number"
            inputMode="numeric"
            placeholder={t("inputs.maxHR.placeholder")}
            value={maxHR}
            onChange={(event) => onMaxHRChange(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rest-hr">{t("inputs.restHR.label")}</Label>
          <Input
            id="rest-hr"
            type="number"
            inputMode="numeric"
            placeholder={t("inputs.restHR.placeholder")}
            value={restHR}
            onChange={(event) => onRestHRChange(event.target.value)}
          />
        </div>
      </div>
      <div className="text-mobile-caption pc:text-xs text-muted-foreground">{t("hint.hrRanges")}</div>

      <div className="mt-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-800/30 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="text-mobile-caption pc:text-xs font-medium">{t("quickEstimate.title")}</div>
          <Badge variant="outline" className="text-mobile-unit pc:text-[10px]">
            {t("quickEstimate.badge")}
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="space-y-2">
            <Label htmlFor="age">{t("inputs.age.label")}</Label>
            <Input
              id="age"
              type="number"
              inputMode="numeric"
              value={age}
              onChange={(event) => onAgeChange(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="est-max-hr">
              {t("inputs.estimatedMaxHR.label")}
            </Label>
            <Input id="est-max-hr" value={estimatedMaxHR ?? "—"} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="est-rest-hr">
              {t("inputs.estimatedRestHR.label")}
            </Label>
            <Input id="est-rest-hr" value={estimatedRestHR ?? "—"} readOnly />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={onApplyEstimate}
            disabled={estimatedMaxHR == null || estimatedRestHR == null}
          >
            {t("buttons.applyEstimate")}
          </Button>
        </div>
        <div className="flex items-start gap-2 text-mobile-caption pc:text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 mt-0.5" />
          <p>{t("info.description")}</p>
        </div>
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={onBack}>
          {t("buttons.back")}
        </Button>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onSkip}>
            {t("buttons.skip")}
          </Button>
          <Button size="sm" onClick={onNext} disabled={!canNext}>
            {t("buttons.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function NewUserDialogStep3({
  canFinish,
  cyclingFtp,
  onBack,
  onCyclingFtpChange,
  onFinish,
  onRunFtpChange,
  onSkip,
  onWeightChange,
  runFtp,
  t,
  weight,
}: {
  canFinish: boolean;
  cyclingFtp: string;
  onBack: () => void;
  onCyclingFtpChange: (value: string) => void;
  onFinish: () => void;
  onRunFtpChange: (value: string) => void;
  onSkip: () => void;
  onWeightChange: (value: string) => void;
  runFtp: string;
  t: TranslateFn;
  weight: string;
}) {
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium flex items-center gap-2">
        <Bike className="w-4 h-4" /> {t("step3.title")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="run-ftp">{t("inputs.runftp.label")}</Label>
          <Input
            id="run-ftp"
            type="number"
            inputMode="numeric"
            placeholder={t("inputs.runftp.placeholder")}
            value={runFtp}
            onChange={(event) => onRunFtpChange(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cycling-ftp">{t("inputs.cyclingftp.label")}</Label>
          <Input
            id="cycling-ftp"
            type="number"
            inputMode="numeric"
            placeholder={t("inputs.cyclingftp.placeholder")}
            value={cyclingFtp}
            onChange={(event) => onCyclingFtpChange(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="weight">{t("inputs.weight.label")}</Label>
          <Input
            id="weight"
            type="number"
            inputMode="numeric"
            placeholder={t("inputs.weight.placeholder")}
            value={weight}
            onChange={(event) => onWeightChange(event.target.value)}
          />
        </div>
      </div>
      <div className="text-mobile-caption pc:text-xs text-muted-foreground">
        {t("hint.otherSports")}
      </div>
      <div className="flex justify-between gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={onBack}>
          {t("buttons.back")}
        </Button>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onSkip}>
            {t("buttons.skip")}
          </Button>
          <Button size="sm" onClick={onFinish} disabled={!canFinish}>
            {t("buttons.finish")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function NewUserDialogHeader({
  step,
  t,
}: {
  step: NewUserDialogStep;
  t: TranslateFn;
}) {
  return (
    <div className="shrink-0  p-0 sm:p-4 border-b border-neutral-200 dark:border-neutral-700">
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="text-lg flex items-center gap-2 font-semibold">
            <Gauge className="w-5 h-5" /> {t("title")}
          </div>
          <NewUserDialogStepIndicator step={step} t={t} />
        </div>
        <div className="text-sm text-muted-foreground">{t("description")}</div>
      </div>
    </div>
  );
}
