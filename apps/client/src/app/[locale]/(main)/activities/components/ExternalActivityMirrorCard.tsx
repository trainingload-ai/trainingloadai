"use client";

import { ArrowRight } from "lucide-react";
import type { V2ExternalActivityMirror } from "@/api/v2-activities";
import { Link } from "@/i18n/navigation";
import {
  ProviderFavicon,
  isThirdPartyProviderBrand,
  thirdPartyProviderName,
} from "@/components/third-party/provider-favicon";
import { ActivitySummaryCard } from "@/components/activities/activity-summary-card";
import { apiFetch } from "@/lib/api";
import { useLocale } from "next-intl";
import * as React from "react";

type Translate = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

function reasonKey(mirror: V2ExternalActivityMirror) {
  if (mirror.status === "ROUTING") return "mirror.syncing";
  if (mirror.reason === "ORIGIN_IMPORT_DISABLED")
    return "mirror.importDisabled";
  if (
    mirror.reason === "ORIGIN_REAUTH_REQUIRED" ||
    mirror.reason === "ORIGIN_SCOPE_REQUIRED"
  )
    return "mirror.reauthRequired";
  if (mirror.reason === "ORIGIN_ACTIVITY_NOT_FOUND") return "mirror.notFound";
  if (mirror.reason === "ORIGIN_ACTIVITY_AMBIGUOUS") return "mirror.ambiguous";
  if (mirror.reason === "ORIGIN_SYNC_FAILED") return "mirror.syncFailed";
  return "mirror.connectionRequired";
}

/**
 * MANAGE_CONNECTION 是后端给前端的动作类型，不是给用户看的文案。
 * 卡片上的按钮应该说明用户此刻要完成的具体动作。
 */
function connectionActionKey(mirror: V2ExternalActivityMirror) {
  if (mirror.reason === "ORIGIN_CONNECTION_REQUIRED") {
    return "mirror.connectSource";
  }
  if (
    mirror.reason === "ORIGIN_REAUTH_REQUIRED" ||
    mirror.reason === "ORIGIN_SCOPE_REQUIRED"
  ) {
    return "mirror.reauthorizeSource";
  }
  if (mirror.reason === "ORIGIN_IMPORT_DISABLED") {
    return "mirror.enableSourceImport";
  }
  return "mirror.checkSourceConnection";
}

function ProviderMark({ provider }: { provider: string }) {
  const knownProvider = isThirdPartyProviderBrand(provider);
  const label = knownProvider ? thirdPartyProviderName(provider) : provider;
  return (
    <span
      aria-label={label}
      className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-background/65 text-[10px] font-semibold uppercase text-muted-foreground"
    >
      {knownProvider ? (
        <span className="inline-flex size-4 items-center justify-center overflow-hidden rounded-xs bg-white">
          <ProviderFavicon provider={provider} className="size-4" />
        </span>
      ) : (
        provider.slice(0, 2)
      )}
    </span>
  );
}

export function ExternalActivityMirrorCard({
  mirror,
  t,
  onRetried,
}: {
  mirror: V2ExternalActivityMirror;
  t: Translate;
  onRetried?: () => void;
}) {
  const [retrying, setRetrying] = React.useState(false);
  const locale = useLocale();
  const time = mirror.startTime ? new Date(mirror.startTime) : null;
  const timeLabel =
    time && Number.isFinite(time.getTime())
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(time)
      : t("common.unknownTime");
  const sourceFlow = (
    <div className="flex items-center gap-1.5">
      <ProviderMark provider={mirror.discoveredVia} />
      <ArrowRight
        className="size-3 text-muted-foreground/70"
        aria-hidden="true"
      />
      <ProviderMark provider={mirror.originProvider} />
    </div>
  );
  return (
    <ActivitySummaryCard
      title={mirror.title || t("mirror.untitled")}
      sportType="UNKNOWN"
      sportLabel={t("mirror.discoveredVia")}
      startLabel={timeLabel}
      note={t(reasonKey(mirror))}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {sourceFlow}
          {mirror.action === "RETRY" ? (
            <button
              type="button"
              disabled={retrying}
              onClick={async () => {
                setRetrying(true);
                try {
                  await apiFetch(
                    `/activities/external-mirrors/${mirror.id}/retry`,
                    { method: "POST" },
                  );
                  onRetried?.();
                } finally {
                  setRetrying(false);
                }
              }}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border bg-background/65 px-2.5 text-xs font-medium text-foreground hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <span aria-live="polite">
                {retrying ? t("mirror.retrying") : t("mirror.retry")}
              </span>
            </button>
          ) : mirror.action === "MANAGE_CONNECTION" ? (
            <Link
              href={`/account?repairExternalMirror=${encodeURIComponent(mirror.id)}#connections`}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border bg-background/65 px-2.5 text-xs font-medium text-foreground hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t(connectionActionKey(mirror))}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : (
            <span className="inline-flex h-8 shrink-0 items-center rounded-md bg-background/65 px-2.5 text-xs text-muted-foreground">
              {t("mirror.pending")}
            </span>
          )}
        </div>
      }
    />
  );
}
