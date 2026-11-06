"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { AlertCircle, RefreshCw } from "lucide-react";
import { AiCoachPageSkeleton } from "./coach-page-skeleton";
import {
  runtimeCapabilityAvailable,
  useRuntimeCapabilities,
} from "@/api/runtime-capabilities";
import { Button } from "@/components/ui/button";

const AiCoachClient = dynamic(
  () => import("./coach-client").then((module) => module.AiCoachClient),
  {
    ssr: false,
    loading: AiCoachPageSkeleton,
  },
);

export function AiCoachClientLoader() {
  const runtime = useRuntimeCapabilities();
  const capability = runtime.data?.capabilities.ai;
  const t = useTranslations("AiCoachPage.transcript");
  if (!runtimeCapabilityAvailable(capability)) {
    const selfHosted = runtime.data?.deployment === "self-host";
    return (
      <main className="flex h-full min-h-[24rem] items-center justify-center p-6">
        <section
          className="w-full max-w-xl rounded-md bg-neutral-100 p-4 text-sm dark:bg-muted/45"
          role="status"
          aria-live="polite"
        >
          <div className="flex gap-2">
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <h1 className="text-sm font-medium text-foreground">
                {selfHosted
                  ? t("titleAccessRequired")
                  : t("titleModelUnavailable")}
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                {selfHosted ? t("reasonAccessRequired") : t("reasonServer")}
              </p>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={runtime.isFetching}
              onClick={() => void runtime.refetch()}
            >
              <RefreshCw
                aria-hidden="true"
                className={
                  runtime.isFetching
                    ? "h-3.5 w-3.5 animate-spin"
                    : "h-3.5 w-3.5"
                }
              />
              {t("retry")}
            </Button>
          </div>
        </section>
      </main>
    );
  }
  return <AiCoachClient />;
}
