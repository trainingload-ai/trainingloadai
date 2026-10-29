"use client";

import dynamic from "next/dynamic";
import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";

import {
  runtimeCapabilityAvailable,
  useRuntimeCapabilities,
} from "@/api/runtime-capabilities";
import { useIntervalsIcuStatus } from "@/api/intervals-icu";
import { IntervalsIcuBrandIcon } from "@/components/icons/intervals-icu";
import {
  ThirdPartyConnectionList,
  type ThirdPartyConnectionItem,
} from "@/components/third-party/third-party-connection-card";

const IntervalsIcuConnectionDialog = dynamic(() =>
  import("@/components/third-party/intervals-icu-connection-dialog").then(
    (module) => module.IntervalsIcuConnectionDialog,
  ),
);

/**
 * Core only exposes the self-hosted Intervals.icu adapter. Cloud login
 * providers and managed training providers are composed by app-overlay.
 */
export function ThirdPartyConnections() {
  const t = useTranslations("ThirdPartyConnections");
  const runtimeCapabilities = useRuntimeCapabilities();
  const intervalsIcuAvailable = runtimeCapabilityAvailable(
    runtimeCapabilities.data?.capabilities["intervals-icu-api-key"],
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: status = { connected: false } } =
    useIntervalsIcuStatus(intervalsIcuAvailable);

  if (!intervalsIcuAvailable) return null;

  const providerName = t("providers.intervalsIcu.name");
  const connected = Boolean(status.connected);
  const item: ThirdPartyConnectionItem = {
    provider: "intervals_icu",
    name: providerName,
    description: t("providers.intervalsIcu.description"),
    icon: IntervalsIcuBrandIcon,
    connected,
    connectedLabel: t("connected"),
    actionLabel: connected
      ? t("intervalsIcu.openSettings")
      : t("connectProvider", { provider: providerName }),
    actionVariant: connected ? "outline" : "default",
    onAction: () => setDialogOpen(true),
  };

  return (
    <section>
      <h2 className="mb-2 px-1 text-base font-semibold">{t("title")}</h2>
      <div className="space-y-2 rounded-md bg-neutral-100 p-3 dark:bg-muted/45">
        <h3 className="px-1 text-mobile-caption font-semibold text-muted-foreground pc:text-xs">
          {t("trainingDataGroup")}
        </h3>
        <ThirdPartyConnectionList
          items={[item]}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        />
      </div>
      <Suspense fallback={null}>
        {dialogOpen ? (
          <IntervalsIcuConnectionDialog
            open
            onOpenChange={setDialogOpen}
            handleOAuthResult={false}
            oauthEnabled={false}
          />
        ) : null}
      </Suspense>
    </section>
  );
}
