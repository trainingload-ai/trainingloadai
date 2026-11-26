"use client";

import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  V2ActivityListItem,
  V2ActivityThirdPartyMapping,
} from "@/api/v2-activities";
import {
  isThirdPartyProviderBrand,
  ProviderFavicon,
  thirdPartyProviderName,
  type ThirdPartyProviderBrand,
} from "@/components/third-party/provider-favicon";
import { ActivityPlanLinkControl } from "@/components/plan/activity-plan-link-control";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function ProviderBadge({
  provider,
  variant,
  manualLabel,
}: {
  provider: ThirdPartyProviderBrand | "manual";
  variant: "inbound" | "outbound";
  manualLabel: string;
}) {
  const isManual = provider === "manual";
  const label = isManual ? manualLabel : thirdPartyProviderName(provider);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={label}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            variant === "inbound"
              ? "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
              : "border border-border bg-background/65 text-muted-foreground",
          )}
        >
          <span className="inline-flex size-4 items-center justify-center overflow-hidden rounded-xs bg-white">
            {isManual ? (
              <Upload className="size-3 text-neutral-600" aria-hidden />
            ) : (
              <ProviderFavicon provider={provider} className="size-4" />
            )}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span translate={isManual ? undefined : "no"}>{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function ThirdPartyMappingBadges({
  mappings,
  side,
  excludeProvider,
  manualLabel,
}: {
  mappings: V2ActivityThirdPartyMapping[];
  side: "inbound" | "outbound";
  excludeProvider?: V2ActivityListItem["primaryProvider"];
  manualLabel: string;
}) {
  const seen = new Set<string>();
  const providers: ThirdPartyProviderBrand[] = [];

  for (const mapping of mappings) {
    const direction = mapping.syncDirection ?? "IMPORT";
    const belongsOnSide =
      side === "inbound"
        ? direction === "IMPORT" || direction === "BIDIRECTIONAL"
        : direction === "EXPORT" || direction === "BIDIRECTIONAL";
    if (
      !belongsOnSide ||
      mapping.provider === excludeProvider ||
      !isThirdPartyProviderBrand(mapping.provider) ||
      seen.has(mapping.provider)
    ) {
      continue;
    }
    seen.add(mapping.provider);
    providers.push(mapping.provider);
  }

  if (providers.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {providers.map((provider) => (
        <ProviderBadge
          key={`${side}:${provider}`}
          provider={provider}
          variant={side}
          manualLabel={manualLabel}
        />
      ))}
    </div>
  );
}

export function ActivityCardFooter({
  activity,
  onLinkedPlanWorkoutChange,
}: {
  activity: Pick<V2ActivityListItem, "hashId" | "status" | "primaryProvider" |
    "thirdPartyMappings" | "planLinkUiVisible" | "linkedPlanWorkout">;
  onLinkedPlanWorkoutChange?: (linked: V2ActivityListItem["linkedPlanWorkout"]) => void;
}) {
  const t = useTranslations("V2ActivitiesPage");
  const manualLabel = t("provider.manual");
  const statusKey = {
    PROCESSING: "status.processing",
    PARTIAL_FAILED: "status.partialFailed",
    FAILED: "status.failed",
    READY: null,
    UNKNOWN: null,
  } as const;
  const key = statusKey[activity.status];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {key ? (
          <span className="rounded-md bg-muted px-2 py-1 text-mobile-caption pc:text-xs text-muted-foreground">
            {t(key)}
          </span>
        ) : null}
        <ProviderBadge
          provider={
            isThirdPartyProviderBrand(activity.primaryProvider)
              ? activity.primaryProvider
              : "manual"
          }
          variant="inbound"
          manualLabel={manualLabel}
        />
        <ThirdPartyMappingBadges
          mappings={activity.thirdPartyMappings}
          side="inbound"
          excludeProvider={activity.primaryProvider}
          manualLabel={manualLabel}
        />
      </div>
      <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
        <ThirdPartyMappingBadges
          mappings={activity.thirdPartyMappings}
          side="outbound"
          manualLabel={manualLabel}
        />
        {activity.planLinkUiVisible ? (
          <ActivityPlanLinkControl
            activity={activity}
            onLinkedPlanWorkoutChange={onLinkedPlanWorkoutChange}
          />
        ) : null}
      </div>
    </div>
  );
}
