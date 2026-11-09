"use client";

import dynamic from "next/dynamic";
import { Suspense, useState, useEffect } from "react";
import { useTranslations } from "next-intl";

import {
  runtimeCapabilityAvailable,
  useRuntimeCapabilities,
} from "@/api/runtime-capabilities";
import { useIntervalsIcuStatus } from "@/api/intervals-icu";
import { usePersonalConnection } from "@/api/personal-integrations";
import type { PersonalProvider } from "@shared/personal-integrations";
import { CorosBrandIcon } from "@/components/icons/coros";
import { GarminBrandIcon } from "@/components/icons/garmin";
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
const PersonalConnectionDialog = dynamic(() =>
  import("@/components/third-party/personal-connection-dialog").then(
    (module) => module.PersonalConnectionDialog,
  ),
);

/**
 * Personal adapters are gated by the Self-host runtime registry. Each dialog
 * owns its protocol; the account section only composes connection cards.
 */
export function ThirdPartyConnections() {
  const t = useTranslations("ThirdPartyConnections");
  const personalT = useTranslations("PersonalIntegrations");
  const runtimeCapabilities = useRuntimeCapabilities();
  const intervalsIcuAvailable = runtimeCapabilityAvailable(
    runtimeCapabilities.data?.capabilities["intervals-icu-api-key"],
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [personalOpen, setPersonalOpen] = useState<PersonalProvider | null>(
    null,
  );
  const selfHost = runtimeCapabilities.data?.deployment === "self-host";
  const garminAvailable =
    selfHost &&
    runtimeCapabilities.data?.capabilities["garmin-personal-api-key"]?.state ===
      "enabled";
  const corosAvailable =
    selfHost &&
    runtimeCapabilities.data?.capabilities["coros-mcp"]?.state === "enabled";
  const garmin = usePersonalConnection("garmin", garminAvailable);
  const coros = usePersonalConnection("coros", corosAvailable);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (corosAvailable && url.searchParams.get("personalProvider") === "coros")
      setPersonalOpen("coros");
  }, [corosAvailable]);
  const { data: status = { connected: false } } = useIntervalsIcuStatus(
    intervalsIcuAvailable,
  );

  if (!intervalsIcuAvailable && !garminAvailable && !corosAvailable)
    return null;

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
  const personalItems: ThirdPartyConnectionItem[] = (
    ["garmin", "coros"] as const
  )
    .filter((provider) =>
      provider === "garmin" ? garminAvailable : corosAvailable,
    )
    .map((provider) => ({
      provider,
      name: provider === "garmin" ? "Garmin" : "COROS",
      description: personalT(`${provider}.description`),
      icon: provider === "garmin" ? GarminBrandIcon : CorosBrandIcon,
      connected: (provider === "garmin" ? garmin : coros).data?.connected,
      connectedLabel: personalT("connected"),
      // Wordmark badges already include the brand name.
      showName: false,
      actionLabel: personalT("manage"),
      actionVariant: "outline",
      onAction: () => setPersonalOpen(provider),
    }));

  return (
    <section>
      <h2 className="mb-2 px-1 text-base font-semibold">{t("title")}</h2>
      <div className="space-y-2 rounded-md bg-neutral-100 p-3 dark:bg-muted/45">
        <h3 className="px-1 text-mobile-caption font-semibold text-muted-foreground pc:text-xs">
          {t("trainingDataGroup")}
        </h3>
        <ThirdPartyConnectionList
          items={[...(intervalsIcuAvailable ? [item] : []), ...personalItems]}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        />
      </div>
      <Suspense fallback={null}>
        {personalOpen &&
        (personalOpen === "garmin" ? garminAvailable : corosAvailable) ? (
          <PersonalConnectionDialog
            key={personalOpen}
            provider={personalOpen}
            open
            onOpenChange={(open) => {
              if (!open) setPersonalOpen(null);
            }}
          />
        ) : null}
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
