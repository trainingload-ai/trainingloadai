"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useAiDataConsent } from "@/api/ai-data-consent";
import {
  featureAllowed,
  useFeatureAccess,
  type ProductFeature,
} from "@/api/feature-access";
import { getUserSettings, updateUserSetting } from "@/api/settings";
import { queryKeys } from "@/lib/query-keys";

type ReviewFeatureKey =
  | "activityReview"
  | "dailyReview"
  | "weeklyReview"
  | "monthlyReview"
  | "planReview";

type ReviewFeatureSettings = Record<ReviewFeatureKey, boolean>;

const DEFAULT_REVIEW_FEATURES: ReviewFeatureSettings = {
  activityReview: true,
  dailyReview: true,
  weeklyReview: true,
  monthlyReview: true,
  planReview: true,
};

const ACCESS_FEATURE_BY_REVIEW: Record<ReviewFeatureKey, ProductFeature> = {
  activityReview: "ai.activityReview",
  dailyReview: "ai.periodReview",
  weeklyReview: "ai.periodReview",
  monthlyReview: "ai.periodReview",
  planReview: "ai.planAdvice",
};

function parseReviewFeatures(value: string | undefined): ReviewFeatureSettings {
  if (!value) return DEFAULT_REVIEW_FEATURES;
  try {
    const parsed = JSON.parse(value) as Partial<ReviewFeatureSettings>;
    return Object.fromEntries(
      Object.entries(DEFAULT_REVIEW_FEATURES).map(([key, fallback]) => [
        key,
        typeof parsed[key as ReviewFeatureKey] === "boolean"
          ? parsed[key as ReviewFeatureKey]
          : fallback,
      ]),
    ) as ReviewFeatureSettings;
  } catch {
    return DEFAULT_REVIEW_FEATURES;
  }
}

export function ReviewAutomationSettings() {
  const t = useTranslations("AccountInner");
  const queryClient = useQueryClient();
  const { data: access } = useFeatureAccess();
  const { data: dataConsent } = useAiDataConsent();
  const { data: userSettings } = useQuery({
    queryKey: queryKeys.user.settings(),
    queryFn: getUserSettings,
  });
  const [savingReviewFeatures, setSavingReviewFeatures] = useState(false);
  const [reviewFeatures, setReviewFeatures] = useState(
    DEFAULT_REVIEW_FEATURES,
  );

  useEffect(() => {
    setReviewFeatures(parseReviewFeatures(userSettings?.AI_REVIEW_MODE));
  }, [userSettings?.AI_REVIEW_MODE]);

  const hasAnyReviewAccess = Object.values(ACCESS_FEATURE_BY_REVIEW).some(
    (feature) => featureAllowed(access, feature),
  );
  const hasAiDataConsent = dataConsent?.granted === true;

  const toggleReviewFeature = async (
    key: ReviewFeatureKey,
    enabled: boolean,
  ) => {
    const next = { ...reviewFeatures, [key]: enabled };
    setReviewFeatures(next);
    try {
      setSavingReviewFeatures(true);
      await updateUserSetting("AI_REVIEW_MODE", JSON.stringify(next));
      await queryClient.invalidateQueries({
        queryKey: queryKeys.user.settings(),
      });
      toast.success(t("reviewAutomation.saved"));
    } catch (error) {
      console.error("update review mode failed", error);
      toast.error(t("reviewAutomation.saveFailed"));
      setReviewFeatures(reviewFeatures);
    } finally {
      setSavingReviewFeatures(false);
    }
  };

  return (
    <section>
      <div className="mb-2 px-1 space-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {t("reviewAutomation.title")}
        </h2>
        <p className="text-mobile-caption pc:text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          {t("reviewAutomation.description")}
        </p>
      </div>
      <div className="rounded-surface bg-neutral-100 p-2.5 dark:bg-muted/45">
        <div className="space-y-2">
          {!hasAnyReviewAccess ? (
            <p className="text-mobile-caption pc:text-xs text-amber-600 dark:text-amber-400">
              {t("reviewAutomation.accessRequired")}
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["activityReview", t("reviewAutomation.activityReview")],
                ["dailyReview", t("reviewAutomation.dailyReview")],
                ["weeklyReview", t("reviewAutomation.weeklyReview")],
                ["monthlyReview", t("reviewAutomation.monthlyReview")],
                ["planReview", t("reviewAutomation.planReview")],
              ] as const
            ).map(([key, label]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-2.5 rounded-control bg-background px-3 py-2.5"
              >
                <span className="text-sm font-normal text-foreground/85">
                  {label}
                </span>
                <Switch
                  checked={reviewFeatures[key]}
                  disabled={
                    !featureAllowed(access, ACCESS_FEATURE_BY_REVIEW[key]) ||
                    !hasAiDataConsent ||
                    savingReviewFeatures
                  }
                  onCheckedChange={(enabled) =>
                    toggleReviewFeature(key, enabled)
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
