"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  featureAllowed,
  useFeatureAccess,
  type ProductFeature,
} from "@/api/feature-access";
import {
  getAutoUpdateConfigs,
  getUserSettings,
  updateAutoUpdateConfig,
  updateUserSetting,
  type AutoUpdateConfig,
} from "@/api/settings";
import { Switch } from "@/components/ui/switch";
import { queryKeys } from "@/lib/query-keys";
import { MobileGroupedList } from "./MobileGroupedList";

type ReviewFeature =
  | "activityReview"
  | "dailyReview"
  | "weeklyReview"
  | "monthlyReview"
  | "planReview";

const DEFAULT_REVIEW_FEATURES: Record<ReviewFeature, boolean> = {
  activityReview: true,
  dailyReview: true,
  weeklyReview: true,
  monthlyReview: true,
  planReview: true,
};

const ACCESS_FEATURE_BY_REVIEW: Record<ReviewFeature, ProductFeature> = {
  activityReview: "ai.activityReview",
  dailyReview: "ai.periodReview",
  weeklyReview: "ai.periodReview",
  monthlyReview: "ai.periodReview",
  planReview: "ai.planAdvice",
};

function parseReviewFeatures(value: string | undefined) {
  if (!value) return DEFAULT_REVIEW_FEATURES;
  try {
    const parsed = JSON.parse(value) as Partial<Record<ReviewFeature, boolean>>;
    return Object.fromEntries(
      Object.entries(DEFAULT_REVIEW_FEATURES).map(([key, fallback]) => [
        key,
        typeof parsed[key as ReviewFeature] === "boolean"
          ? parsed[key as ReviewFeature]
          : fallback,
      ]),
    ) as Record<ReviewFeature, boolean>;
  } catch {
    return DEFAULT_REVIEW_FEATURES;
  }
}

const AUTO_UPDATE_SECTIONS: Array<{
  key: "power" | "pace" | "heartRate";
  metrics: Array<{
    metric: AutoUpdateConfig["metric"];
    label: string;
    translationKey: "ftp" | "cp" | "wPrime" | "pMax" | "tp" | "cs" | "lthr" | "maxHr";
  }>;
}> = [
  {
    key: "power",
    metrics: [
      { metric: "FTP", label: "FTP", translationKey: "ftp" },
      { metric: "CP", label: "CP", translationKey: "cp" },
      { metric: "W_PRIME", label: "W′", translationKey: "wPrime" },
      { metric: "P_MAX", label: "Pmax", translationKey: "pMax" },
    ],
  },
  {
    key: "pace",
    metrics: [
      { metric: "TP", label: "TP", translationKey: "tp" },
      { metric: "CS", label: "CS", translationKey: "cs" },
    ],
  },
  {
    key: "heartRate",
    metrics: [
      { metric: "LTHR", label: "LTHR", translationKey: "lthr" },
      { metric: "MAX_HR", label: "Max HR", translationKey: "maxHr" },
    ],
  },
];

function MobileToggle({
  checked,
  disabled,
  label,
  detail,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: ReactNode;
  detail: ReactNode;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-[58px] items-center gap-3 border-b border-border/60 bg-card px-4 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-mobile-headline leading-5 text-foreground">{label}</div>
        <div className="mt-0.5 truncate text-mobile-caption leading-4 text-muted-foreground">
          {detail}
        </div>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="h-[31px] w-[51px] border-0 [&_[data-slot=switch-thumb]]:size-[27px] [&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-5"
      />
    </div>
  );
}

function MobileSettingsSection({
  children,
  footer,
  title,
}: {
  children: ReactNode;
  footer?: ReactNode;
  title: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-mobile-caption font-medium text-muted-foreground">{title}</h2>
      <MobileGroupedList>{children}</MobileGroupedList>
      {footer ? (
        <p className="px-1 text-mobile-caption leading-5 text-muted-foreground">{footer}</p>
      ) : null}
    </section>
  );
}

export function MobileAutoUpdatePanel() {
  const t = useTranslations("AccountPage.autoUpdate");
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.user.autoUpdateConfig(),
    queryFn: getAutoUpdateConfigs,
  });
  const enabledMap = useMemo(
    () => new Map((data ?? []).map((item) => [item.metric, item.enabled])),
    [data],
  );
  const updateMutation = useMutation({
    mutationFn: ({ metric, enabled }: { metric: AutoUpdateConfig["metric"]; enabled: boolean }) =>
      updateAutoUpdateConfig(metric, enabled),
    onSuccess: (_saved, variables) => {
      toast.success(variables.enabled ? t("toast.enabledSuccess") : t("toast.disabledSuccess"));
      void queryClient.invalidateQueries({ queryKey: queryKeys.user.autoUpdateConfig() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.root.userProfile });
      void queryClient.invalidateQueries({ queryKey: queryKeys.root.fitnessStatusMetricPair });
      void queryClient.invalidateQueries({ queryKey: queryKeys.root.userFitnessMetricPairs });
    },
    onError: () => toast.error(t("toast.updateFailed")),
  });

  if (isLoading) {
    return (
      <MobileGroupedList>
        <div className="flex min-h-[174px] items-center justify-center text-mobile-control text-muted-foreground">
          {t("mobileLoading")}
        </div>
      </MobileGroupedList>
    );
  }

  if (isError) {
    return (
      <MobileGroupedList>
        <button type="button" onClick={() => void refetch()} className="min-h-24 w-full px-5 text-mobile-control text-red-500">
          {t("toast.updateFailed")}
        </button>
      </MobileGroupedList>
    );
  }

  return (
    <div className="space-y-4">
      <p className="px-1 text-mobile-caption leading-5 text-muted-foreground">{t("mobileHint")}</p>
      {AUTO_UPDATE_SECTIONS.map((section) => (
        <MobileSettingsSection
          key={section.key}
          title={t(`sections.${section.key}.title`)}
          footer={section.key === "power" || section.key === "pace" ? t(`sections.${section.key}.footer`) : undefined}
        >
          {section.metrics.map((item) => {
            const pending = updateMutation.isPending && updateMutation.variables?.metric === item.metric;
            return (
              <MobileToggle
                key={item.metric}
                label={item.metric === "MAX_HR" ? t("sections.heartRate.maxHrLabel") : item.label}
                detail={t(`mobileMetrics.${item.translationKey}`)}
                checked={enabledMap.get(item.metric) ?? false}
                disabled={pending}
                onCheckedChange={(enabled) => updateMutation.mutate({ metric: item.metric, enabled })}
              />
            );
          })}
        </MobileSettingsSection>
      ))}
    </div>
  );
}

export function MobileReviewAutomationPanel() {
  const t = useTranslations("AccountInner.reviewAutomation");
  const queryClient = useQueryClient();
  const access = useFeatureAccess();
  const settings = useQuery({
    queryKey: queryKeys.user.settings(),
    queryFn: getUserSettings,
  });
  const [features, setFeatures] = useState(DEFAULT_REVIEW_FEATURES);
  const hasReviewAccess = Object.values(ACCESS_FEATURE_BY_REVIEW).some(
    (feature) => featureAllowed(access.data, feature),
  );

  useEffect(() => {
    setFeatures(parseReviewFeatures(settings.data?.AI_REVIEW_MODE));
  }, [settings.data?.AI_REVIEW_MODE]);

  const updateMutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: ReviewFeature; enabled: boolean }) => {
      const previous = features;
      const next = { ...features, [key]: enabled };
      setFeatures(next);
      try {
        await updateUserSetting("AI_REVIEW_MODE", JSON.stringify(next));
        return next;
      } catch (error) {
        setFeatures(previous);
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.user.settings() });
      toast.success(t("saved"));
    },
    onError: () => toast.error(t("saveFailed")),
  });

  if (access.isLoading || settings.isLoading) {
    return (
      <MobileGroupedList>
        <div className="flex min-h-40 items-center justify-center text-mobile-control text-muted-foreground">{t("loading")}</div>
      </MobileGroupedList>
    );
  }

  if (access.isError || settings.isError) {
    return (
      <MobileGroupedList>
        <button type="button" onClick={() => void Promise.all([access.refetch(), settings.refetch()])} className="min-h-24 w-full px-5 text-mobile-control text-red-500">
          {t("saveFailed")}
        </button>
      </MobileGroupedList>
    );
  }

  const sections: Array<{
    key: string;
    title: string;
    footer?: string;
    rows: ReviewFeature[];
  }> = [
    { key: "activity", title: t("sections.activity"), rows: ["activityReview"] },
    { key: "cycle", title: t("sections.cycle"), footer: t("cycleFooter"), rows: ["dailyReview", "weeklyReview", "monthlyReview"] },
    { key: "plan", title: t("sections.plan"), rows: ["planReview"] },
  ];

  return (
    <div className="space-y-4">
      <p className="px-1 text-mobile-caption leading-5 text-muted-foreground">{t("hint")}</p>
      {!hasReviewAccess ? (
        <MobileGroupedList>
          <div className="bg-card px-4 py-4">
            <p className="text-mobile-headline font-semibold">{t("accessRequired")}</p>
            <p className="mt-1 text-mobile-caption leading-5 text-muted-foreground">{t("description")}</p>
          </div>
        </MobileGroupedList>
      ) : null}
      {sections.map((section) => (
        <MobileSettingsSection key={section.key} title={section.title} footer={section.footer}>
          {section.rows.map((key) => (
            <MobileToggle
              key={key}
              label={t(key)}
              detail={t(`details.${key}`)}
              checked={features[key]}
              disabled={!featureAllowed(access.data, ACCESS_FEATURE_BY_REVIEW[key]) || updateMutation.isPending}
              onCheckedChange={(enabled) => updateMutation.mutate({ key, enabled })}
            />
          ))}
        </MobileSettingsSection>
      ))}
    </div>
  );
}
