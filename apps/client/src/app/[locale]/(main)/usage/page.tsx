"use client";

import { useTranslations } from "next-intl";
import { KeyRound, Settings2 } from "lucide-react";

import {
  useRuntimeCapabilities,
  type RuntimeCapability,
} from "@/api/runtime-capabilities";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { DeploymentUsagePage } from "@deployment/managed-ui";

const AI_PROVIDER_TRANSLATIONS = {
  openai: "providers.openai",
  deepseek: "providers.deepseek",
  openrouter: "providers.openrouter",
  dashscope: "providers.dashscope",
  "custom-openai-compatible": "providers.custom-openai-compatible",
} as const;

function SelfHostUsagePage({
  aiCapability,
}: {
  aiCapability?: RuntimeCapability;
}) {
  const t = useTranslations("UsagePage");
  const tAi = useTranslations("SelfHostAiSettings");
  const providerKey = aiCapability?.provider as
    | keyof typeof AI_PROVIDER_TRANSLATIONS
    | undefined;
  const providerName =
    providerKey && providerKey in AI_PROVIDER_TRANSLATIONS
      ? tAi(AI_PROVIDER_TRANSLATIONS[providerKey])
      : aiCapability?.provider && aiCapability.provider !== "none"
        ? aiCapability.provider
        : t("selfHost.notConfigured");
  const status = aiCapability?.state;
  const statusLabel =
    status === "enabled"
      ? t("selfHost.statusReady")
      : status === "misconfigured"
        ? t("selfHost.statusIssue")
        : t("selfHost.statusOff");

  return (
    <div className="mx-auto w-full max-w-5xl pb-4">
      <h1 className="sr-only">{t("title")}</h1>
      <header className="max-w-3xl px-1 pb-5 pt-2 sm:pb-6 sm:pt-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <KeyRound className="size-3.5" aria-hidden="true" />
          <span>{t("selfHost.eyebrow")}</span>
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
          {t("selfHost.title")}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {t("selfHost.description")}
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_320px] md:items-stretch">
        <section
          aria-label={t("selfHost.statusSummary")}
          className="overflow-hidden rounded-md border border-border/70 bg-background"
        >
          <dl className="divide-y divide-border/70">
            <div className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
              <dt className="text-xs font-medium text-muted-foreground">
                {t("selfHost.currentProvider")}
              </dt>
              <dd className="flex items-center gap-2 text-sm font-semibold sm:justify-end">
                {aiCapability ? (
                  <>
                    <span>{providerName}</span>
                    <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          status === "enabled"
                            ? "bg-emerald-500"
                            : status === "misconfigured"
                              ? "bg-destructive"
                              : "bg-muted-foreground/50",
                        )}
                        aria-hidden="true"
                      />
                      {statusLabel}
                    </span>
                  </>
                ) : (
                  <Skeleton className="h-5 w-28" />
                )}
              </dd>
            </div>
            <div className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
              <dt className="text-xs font-medium text-muted-foreground">
                {t("selfHost.trainingloadMetering")}
              </dt>
              <dd className="text-sm font-semibold sm:text-right">
                {t("selfHost.notApplicable")}
              </dd>
            </div>
            <div className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
              <dt className="text-xs font-medium text-muted-foreground">
                {t("selfHost.providerRecords")}
              </dt>
              <dd className="text-sm font-semibold sm:text-right">
                {t("selfHost.providerDashboard")}
              </dd>
            </div>
          </dl>
        </section>

        <aside className="flex flex-col justify-between rounded-md bg-neutral-100 px-4 py-4 dark:bg-muted/45 sm:px-5">
          <div>
            <h3 className="text-sm font-semibold">
              {t("selfHost.explanationTitle")}
            </h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {t("selfHost.providerUsage")}
            </p>
          </div>
          <Button asChild size="sm" className="mt-5 w-full justify-between">
            <Link href="/settings">
              {t("selfHost.openSettings")}
              <Settings2 className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}

export default function UsagePage() {
  const t = useTranslations("UsagePage");
  useSetPageTitle(t("title"));
  const runtimeCapabilities = useRuntimeCapabilities();
  const isSelfHost =
    runtimeCapabilities.data?.deployment === "self-host" ||
    (!runtimeCapabilities.data &&
      Boolean(process.env.NEXT_PUBLIC_SELF_HOST_MODE));

  if (isSelfHost) {
    return (
      <SelfHostUsagePage
        aiCapability={runtimeCapabilities.data?.capabilities?.ai}
      />
    );
  }

  return <DeploymentUsagePage />;
}
