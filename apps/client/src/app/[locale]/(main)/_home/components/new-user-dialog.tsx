"use client";

import React, { useMemo, useState } from "react";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
} from "@/components/ui/adaptive-dialog";
import { Button } from "@/components/ui/button";
import { useStore, type SportType as StoreSportType } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  BodyMetricTypes,
  replaceUserBodyMetrics,
  replaceUserFitnessMetricManualHistory,
} from "@/api/settings";
import { SportType as ApiSportType } from "@/api/activities";
import {
  NewUserDialogHeader,
  NewUserDialogStep1,
  NewUserDialogStep2,
  NewUserDialogStep3,
} from "./NewUserDialogSteps";
import { queryKeys } from "@/lib/query-keys";
import {
  canFinishStep3,
  canProceedFromStep1,
  canProceedFromStep2,
  getEstimatedMaxHeartRate,
  getEstimatedRestHeartRate,
  getNewUserSportOptions,
  parseEstimatedAge,
  type PreferredSport,
  type NewUserDialogStep,
} from "./new-user-dialog-model";

type NewUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
};

export default function NewUserDialog(props: NewUserDialogProps) {
  const { open, onOpenChange, onComplete } = props;
  const queryClient = useQueryClient();
  const {
    setDashboardSportType,
    setActivitiesSportType,
    setPowerSportType,
    setPmcSportType,
    setMapSportType,
  } = useStore();

  const firstEffectiveDate = "1970-01-01";
  const [step, setStep] = useState<NewUserDialogStep>(1);
  const [preferredSports, setPreferredSports] = useState<PreferredSport[]>([]);
  const [maxHR, setMaxHR] = useState<string>("");
  const [restHR, setRestHR] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [runFtp, setRunFtp] = useState<string>("");
  const [cyclingFtp, setCyclingFtp] = useState<string>("");
  const [weight, setWeight] = useState<string>("");
  const t = useTranslations("NewUserDialog");

  const canNextStep1 = useMemo(() => canProceedFromStep1(preferredSports), [preferredSports]);
  const canNextStep2 = useMemo(
    () => canProceedFromStep2({ maxHR, restHR }),
    [maxHR, restHR],
  );
  const ageNum = useMemo(() => parseEstimatedAge(age), [age]);
  const estimatedMaxHR = useMemo(() => getEstimatedMaxHeartRate(ageNum), [ageNum]);
  const estimatedRestHR = useMemo(() => getEstimatedRestHeartRate(ageNum), [ageNum]);
  const canFinishFinalStep = useMemo(
    () => canFinishStep3({ cyclingFtp, runFtp, weight }),
    [cyclingFtp, runFtp, weight],
  );
  const sportOptions = useMemo(() => getNewUserSportOptions(t), [t]);

  const handleToggleSport = (val: PreferredSport) => {
    setPreferredSports((prev) =>
      prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val],
    );
  };

  const handleNextFromStep1 = () => {
    // 若多选，则设置为 all；若单选，则应用该运动类型到各页面过滤器
    const selectedCount = preferredSports.length;
    if (selectedCount === 1) {
      const one = preferredSports[0] as StoreSportType;
      setDashboardSportType(one);
      setActivitiesSportType(one);
      setPowerSportType(one);
      setPmcSportType(one);
      setMapSportType(one);
    } else {
      setDashboardSportType("all");
      setActivitiesSportType("all");
      setPowerSportType("all");
      setPmcSportType("all");
      setMapSportType("all");
    }
    setStep(2);
  };

  const handleNextFromStep2 = async () => {
    if (!canNextStep2) return;
    await Promise.all([
      replaceUserFitnessMetricManualHistory(
        "MAX_HR",
        [{ effectiveDate: firstEffectiveDate, value: String(Number(maxHR)) }],
        ApiSportType.UNKNOWN,
      ),
      replaceUserFitnessMetricManualHistory(
        "RESTING_HR",
        [
          {
            effectiveDate: firstEffectiveDate,
            value: String(Number(restHR)),
          },
        ],
        ApiSportType.UNKNOWN,
      ),
    ]);
    await queryClient.invalidateQueries({
      queryKey: queryKeys.user.profile(),
    });
    setStep(3);
  };

  const handleFinish = async () => {
    if (!canFinishStep3) return;

    const promises: Array<Promise<unknown>> = [];
    if (weight) {
      promises.push(
        replaceUserBodyMetrics(BodyMetricTypes.WEIGHT, [
          { effectiveDate: firstEffectiveDate, value: String(Number(weight)) },
        ]),
      );
    }

    if (runFtp) {
      promises.push(
        replaceUserFitnessMetricManualHistory(
          "FTP",
          [
            {
              effectiveDate: firstEffectiveDate,
              value: String(Number(runFtp)),
            },
          ],
          ApiSportType.RUN,
        ),
      );
    }

    if (cyclingFtp) {
      promises.push(
        replaceUserFitnessMetricManualHistory(
          "FTP",
          [
            {
              effectiveDate: firstEffectiveDate,
              value: String(Number(cyclingFtp)),
            },
          ],
          ApiSportType.CYCLING,
        ),
      );
    }

    await Promise.all(promises);
    await queryClient.invalidateQueries({
      queryKey: queryKeys.user.profile(),
    });
    onOpenChange(false);
    onComplete?.();
  };

  return (
    <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
      <AdaptiveDialogContent
        desktopClassName={cn(
          "sm:max-w-lg md:max-w-3xl p-0 overflow-hidden flex flex-col gap-0 max-h-[calc(100vh-2rem)]",
          "rounded-2xl border border-neutral-200 dark:border-neutral-700",
          "bg-background",
        )}
        mobileClassName={cn(
          "max-h-[92vh] overflow-hidden",
          "rounded-t-compact border border-neutral-200 dark:border-neutral-700",
          "bg-background",
        )}
        desktopProps={{
          onInteractOutside: (e) => e.preventDefault(),
        }}
      >
        <NewUserDialogHeader step={step} t={t} />

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
          {step === 1 ? (
            <NewUserDialogStep1
              canNext={canNextStep1}
              onNext={handleNextFromStep1}
              onSkip={() => setStep(2)}
              onToggleSport={handleToggleSport}
              preferredSports={preferredSports}
              sportOptions={sportOptions}
              t={t}
            />
          ) : null}

          {step === 2 ? (
            <NewUserDialogStep2
              age={age}
              canNext={canNextStep2}
              estimatedMaxHR={estimatedMaxHR}
              estimatedRestHR={estimatedRestHR}
              maxHR={maxHR}
              onAgeChange={setAge}
              onApplyEstimate={() => {
                if (estimatedMaxHR != null) setMaxHR(String(estimatedMaxHR));
                if (estimatedRestHR != null) setRestHR(String(estimatedRestHR));
              }}
              onBack={() => setStep(1)}
              onMaxHRChange={setMaxHR}
              onNext={handleNextFromStep2}
              onRestHRChange={setRestHR}
              onSkip={() => setStep(3)}
              restHR={restHR}
              t={t}
            />
          ) : null}

          {step === 3 ? (
            <NewUserDialogStep3
              canFinish={canFinishFinalStep}
              cyclingFtp={cyclingFtp}
              onBack={() => setStep(2)}
              onCyclingFtpChange={setCyclingFtp}
              onFinish={handleFinish}
              onRunFtpChange={setRunFtp}
              onSkip={() => {
                onOpenChange(false);
                onComplete?.();
              }}
              onWeightChange={setWeight}
              runFtp={runFtp}
              t={t}
              weight={weight}
            />
          ) : null}
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
