"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  getAutoUpdateConfigs,
  updateAutoUpdateConfig,
  type AutoUpdateConfig,
} from "@/api/settings";
import { queryKeys } from "@/lib/query-keys";

const AUTO_UPDATE_METRICS: Array<{
  metric: AutoUpdateConfig["metric"];
  labelKey: string;
}> = [
  { metric: "FTP", labelKey: "ftp" },
  { metric: "CP", labelKey: "cp" },
  { metric: "W_PRIME", labelKey: "wPrime" },
  { metric: "P_MAX", labelKey: "pMax" },
  { metric: "CS", labelKey: "cs" },
  { metric: "TP", labelKey: "tp" },
  { metric: "LTHR", labelKey: "lthr" },
  { metric: "MAX_HR", labelKey: "maxHr" },
];

export function AutoUpdateSettings() {
  const t = useTranslations("AccountPage.autoUpdate");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.user.autoUpdateConfig(),
    queryFn: getAutoUpdateConfigs,
  });

  const configMap = useMemo(() => {
    return new Map((data ?? []).map((item) => [item.metric, item.enabled]));
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: ({
      metric,
      enabled,
    }: {
      metric: AutoUpdateConfig["metric"];
      enabled: boolean;
    }) => updateAutoUpdateConfig(metric, enabled),
    onSuccess: (_saved, variables) => {
      toast.success(
        variables.enabled
          ? t("toast.enabledSuccess")
          : t("toast.disabledSuccess"),
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.user.autoUpdateConfig(),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.root.userProfile });
      queryClient.invalidateQueries({
        queryKey: queryKeys.root.fitnessStatusMetricPair,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.root.userFitnessMetricPairs,
      });
    },
    onError: () => {
      toast.error(t("toast.updateFailed"));
    },
  });

  return (
    <section>
      <div className="mb-2 px-1 space-y-1">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-mobile-caption pc:text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          {t("description")}
        </p>
      </div>
      <div className="rounded-surface bg-neutral-100 p-2.5 dark:bg-muted/45">
        {isLoading ? (
          <div className="flex min-h-[96px] items-center justify-center text-sm text-muted-foreground">
            {t("loading")}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {AUTO_UPDATE_METRICS.map((item) => {
              const checked = configMap.get(item.metric) ?? true;
              const isPending =
                updateMutation.isPending &&
                updateMutation.variables?.metric === item.metric;
              return (
                <div
                  key={item.metric}
                  className="flex items-center justify-between gap-2.5 rounded-control bg-background px-3 py-2.5"
                >
                  <span className="text-sm font-normal text-foreground/85">
                    {t(`metrics.${item.labelKey}`)}
                  </span>
                  <Switch
                    checked={checked}
                    disabled={isPending}
                    onCheckedChange={(enabled) =>
                      updateMutation.mutate({ metric: item.metric, enabled })
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
