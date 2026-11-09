"use client";

import { useTranslations } from "next-intl";
import { Settings2 } from "lucide-react";
import type { RuntimeCapability } from "@/api/runtime-capabilities";
import { useSelfHostAiConfiguration } from "@/api/self-host-ai-configuration";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ApiFetchError } from "@/lib/api";

export function DesktopCoachCapabilityState({
  capability,
  loading,
  onRetry,
}: {
  capability: RuntimeCapability | undefined;
  loading: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations("AiCoachPage.setup");
  // A successful owner-only read establishes access without exposing a key.
  const configuration = useSelfHostAiConfiguration(Boolean(capability));
  const permissionDenied =
    configuration.error instanceof ApiFetchError &&
    [401, 403, 404].includes(configuration.error.status);
  const unavailable =
    !capability || (configuration.isError && !permissionDenied);
  const misconfigured = capability?.state === "misconfigured";
  const titleKey = unavailable
    ? "unavailableTitle"
    : misconfigured ? "incompleteTitle" : "title";
  const descriptionKey = unavailable
    ? "unavailableDescription"
    : permissionDenied
      ? "ownerRequired"
      : misconfigured ? "incompleteDescription" : "description";

  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6 py-8">
      {loading || (capability && configuration.isPending) ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("loading")}
        </p>
      ) : (
        <section
          className="flex w-full max-w-sm flex-col items-center gap-3 text-center"
          aria-labelledby="coach-setup-title"
        >
          <h1
            id="coach-setup-title"
            className="text-lg font-semibold text-foreground"
          >
            {t(titleKey)}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {t(descriptionKey)}
          </p>
          {unavailable ? (
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => {
                if (capability) void configuration.refetch();
                else onRetry();
              }}
            >
              {t("retry")}
            </Button>
          ) : !permissionDenied && configuration.data ? (
            <Button asChild className="mt-2">
              <Link href="/settings#self-host-ai">
                <Settings2 data-icon="inline-start" aria-hidden="true" />
                {t("configure")}
              </Link>
            </Button>
          ) : null}
        </section>
      )}
    </div>
  );
}
