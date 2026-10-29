"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { AiCoachPageSkeleton } from "./coach-page-skeleton";
import {
  runtimeCapabilityAvailable,
  useRuntimeCapability,
} from "@/api/runtime-capabilities";

const AiCoachClient = dynamic(
  () => import("./coach-client").then((module) => module.AiCoachClient),
  {
    ssr: false,
    loading: AiCoachPageSkeleton,
  },
);

export function AiCoachClientLoader() {
  const capability = useRuntimeCapability("ai");
  const t = useTranslations("AiCoachPage.transcript");
  if (!runtimeCapabilityAvailable(capability)) {
    return (
      <main className="flex h-full min-h-[24rem] items-center justify-center p-6">
        <section className="w-full max-w-md border border-border bg-background p-6 text-center">
          <h1 className="text-base font-semibold text-foreground">
            {capability?.state === "misconfigured"
              ? t("titleModelTierUnavailable")
              : t("titleSystem")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("reasonServer")}
          </p>
          <code className="mt-4 block text-xs text-muted-foreground">
            {capability?.code}
          </code>
        </section>
      </main>
    );
  }
  return <AiCoachClient />;
}
