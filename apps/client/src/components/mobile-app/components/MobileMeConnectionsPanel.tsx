"use client";

import { ChevronRight, Link2, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { useIntervalsIcuStatus } from "@/api/intervals-icu";
import {
  runtimeCapabilityAvailable,
  useRuntimeCapability,
} from "@/api/runtime-capabilities";
import { IntervalsIcuConnectionDialog } from "@/components/third-party/intervals-icu-connection-dialog";
import { MobileGroupedList } from "./MobileGroupedList";

function labelsFor(locale: string) {
  if (locale === "zh" || locale === "zh-hant") {
    return {
      intro: "管理这个本地实例允许连接的训练数据来源。",
      group: "训练数据",
      connected: "已连接",
      notConnected: "未连接",
      loading: "加载中",
    };
  }
  return {
    intro: "Manage training data sources supported by this local instance.",
    group: "Training data",
    connected: "Connected",
    notConnected: "Not connected",
    loading: "Loading",
  };
}

export function MobileConnectionsPanel() {
  const locale = useLocale();
  const t = useTranslations("ThirdPartyConnections");
  const labels = labelsFor(locale);
  const available = runtimeCapabilityAvailable(
    useRuntimeCapability("intervals-icu-api-key"),
  );
  const status = useIntervalsIcuStatus(available);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <div className="space-y-5">
        <p className="text-mobile-caption leading-[18px] text-muted-foreground">
          {labels.intro}
        </p>
        {available ? (
          <section className="space-y-2">
            <h2 className="px-1 text-mobile-caption font-medium text-muted-foreground">
              {labels.group}
            </h2>
            <MobileGroupedList>
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-muted/65"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-compact bg-[#5856d6] text-white">
                  <RefreshCw className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-mobile-body font-semibold">
                    Intervals.icu
                  </span>
                  <span className="line-clamp-2 text-mobile-caption text-muted-foreground">
                    {t("providers.intervalsIcu.description")}
                  </span>
                </span>
                <span className="text-mobile-caption text-muted-foreground">
                  {status.isLoading
                    ? labels.loading
                    : status.data?.connected
                      ? labels.connected
                      : labels.notConnected}
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/45" />
              </button>
            </MobileGroupedList>
          </section>
        ) : (
          <div className="flex items-center gap-2 rounded-surface bg-card px-4 py-3 text-mobile-caption text-muted-foreground">
            <Link2 className="size-4" />
            {t("trainingDataGroup")}
          </div>
        )}
      </div>
      {dialogOpen ? (
        <IntervalsIcuConnectionDialog
          open
          onOpenChange={setDialogOpen}
          handleOAuthResult={false}
          oauthEnabled={false}
        />
      ) : null}
    </>
  );
}
