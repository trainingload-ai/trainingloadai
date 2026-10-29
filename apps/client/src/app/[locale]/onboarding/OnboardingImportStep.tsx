"use client";

import dynamic from "next/dynamic";
import { Link2, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useIntervalsIcuStatus } from "@/api/intervals-icu";
import {
  runtimeCapabilityAvailable,
  useRuntimeCapability,
} from "@/api/runtime-capabilities";
import { IntervalsIcuBrandIcon } from "@/components/icons/intervals-icu";
import { Badge } from "@/components/ui/badge";
import type { ThirdPartyConnectionItem } from "@/components/third-party/third-party-connection-card";

const ActivityUploadCard = dynamic(
  () =>
    import("@/components/activities/ActivityUploadCard").then(
      (module) => module.ActivityUploadCard,
    ),
  { ssr: false },
);

const ThirdPartyConnectionList = dynamic(
  () =>
    import("@/components/third-party/third-party-connection-card").then(
      (module) => module.ThirdPartyConnectionList,
    ),
  { ssr: false },
);

const IntervalsIcuConnectionDialog = dynamic(
  () =>
    import("@/components/third-party/intervals-icu-connection-dialog").then(
      (module) => module.IntervalsIcuConnectionDialog,
    ),
  { ssr: false },
);

function getImportStepUrl() {
  if (typeof window === "undefined") return "/onboarding?step=import";
  const url = new URL(window.location.href);
  url.searchParams.set("step", "import");
  return url.toString();
}

function StepShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("OnboardingPage");
  return (
    <section className="rounded-surface bg-muted/45 p-5 text-card-foreground sm:p-6">
      <Badge variant="secondary" className="mb-3 text-muted-foreground">
        {t("step5.eyebrow")}
      </Badge>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {t("step5.title")}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {t("step5.subtitle")}
      </p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function ImportMethodHeader({
  description,
  icon,
  title,
}: {
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-mobile-caption leading-5 text-muted-foreground pc:text-xs">
          {description}
        </p>
      </div>
    </div>
  );
}

export function OnboardingImportStep({
  onConnectionStatusChange,
  onUploaded,
}: {
  onConnectionStatusChange: (connected: boolean) => void;
  onUploaded: () => void;
}) {
  const t = useTranslations("OnboardingPage");
  const thirdPartyT = useTranslations("ThirdPartyConnections");
  const intervalsIcuAvailable = runtimeCapabilityAvailable(
    useRuntimeCapability("intervals-icu-api-key"),
  );
  const { data: status = { connected: false } } = useIntervalsIcuStatus(
    intervalsIcuAvailable,
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    onConnectionStatusChange(Boolean(status.connected));
  }, [onConnectionStatusChange, status.connected]);

  const item: ThirdPartyConnectionItem = {
    provider: "intervals_icu",
    name: thirdPartyT("providers.intervalsIcu.name"),
    description: t("step5.providers.intervals_icu.apiKeyDescription"),
    icon: IntervalsIcuBrandIcon,
    connected: Boolean(status.connected),
    connectedLabel: t("step5.connected"),
    showName: true,
    actionIcon: <Link2 className="mr-2 h-4 w-4" />,
    actionLabel: status.connected ? t("step5.connected") : t("step5.connect"),
    actionVariant: status.connected ? "outline" : "default",
    disabled: Boolean(status.connected),
    onAction: () => setDialogOpen(true),
  };

  return (
    <StepShell>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="rounded-surface bg-background/70 p-4">
          <ImportMethodHeader
            icon={<UploadCloud className="h-5 w-5 text-muted-foreground" />}
            title={t("step5.uploadMethod.title")}
            description={t("step5.uploadMethod.description")}
          />
          <ActivityUploadCard
            maxFiles={10}
            cardTitle={t("step5.upload.title")}
            description={t("step5.upload.description")}
            buttonLabel={t("step5.upload.button")}
            onUploaded={onUploaded}
            skipProgressAfterUpload
          />
        </section>
        {intervalsIcuAvailable ? (
          <section className="rounded-surface bg-background/70 p-4">
            <ImportMethodHeader
              icon={<Link2 className="h-5 w-5 text-muted-foreground" />}
              title={t("step5.platforms.title")}
              description={t("step5.platforms.description")}
            />
            <ThirdPartyConnectionList
              items={[item]}
              layout="row"
              className="grid gap-3"
            />
          </section>
        ) : null}
      </div>
      {dialogOpen ? (
        <IntervalsIcuConnectionDialog
          open
          onOpenChange={setDialogOpen}
          returnUrl={getImportStepUrl()}
          showDisconnect={false}
          handleOAuthResult={false}
          oauthEnabled={false}
        />
      ) : null}
    </StepShell>
  );
}
