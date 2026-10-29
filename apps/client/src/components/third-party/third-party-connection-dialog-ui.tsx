"use client";

import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type ThirdPartySettingOption = {
  id: string;
  label: ReactNode;
  description: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  unavailableReason?: ReactNode;
};

export function ThirdPartyConnectionSummary({
  account,
  connectedLabel,
  lastSyncLabel,
  lastSync,
  neverSyncedLabel,
  error,
  extra,
}: {
  account?: ReactNode;
  connectedLabel: ReactNode;
  lastSyncLabel: ReactNode;
  lastSync?: ReactNode;
  neverSyncedLabel: ReactNode;
  error?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
      <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        <div className="min-w-0 break-words">{account}</div>
        <div className="flex min-w-0 items-center">
          <Badge variant="secondary" className="shrink-0">
            {connectedLabel}
          </Badge>
        </div>
        <div className="min-w-0 break-words sm:col-span-2">
          {lastSyncLabel}: {lastSync ?? neverSyncedLabel}
        </div>
        {extra}
      </div>
      {error ? (
        <div className="mt-2 break-words text-destructive">{error}</div>
      ) : null}
    </div>
  );
}

export function ThirdPartyAuthorizationNotice({
  title,
  description,
  extra,
}: {
  title: ReactNode;
  description: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <div className="min-w-0 space-y-1">
          <div className="break-words font-medium">{title}</div>
          <p className="break-words text-mobile-caption leading-5 text-muted-foreground pc:text-xs">
            {description}
          </p>
          {extra}
        </div>
      </div>
    </div>
  );
}

/**
 * Shared settings surface for every provider. Provider dialogs supply only
 * supported options and provider-specific copy.
 */
export function ThirdPartySyncOptions({
  options,
  className,
}: {
  options: ThirdPartySettingOption[];
  className?: string;
}) {
  if (!options.length) return null;
  return (
    <div
      className={cn(
        "max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-border/70 bg-background [scrollbar-gutter:stable]",
        className,
      )}
    >
      {options.map((option, index) => (
        <label
          key={option.id}
          className={cn(
            "flex min-w-0 items-start gap-2.5 px-3 py-2.5 text-sm text-muted-foreground transition-colors",
            index > 0 && "border-t border-border/60",
            option.disabled
              ? "cursor-not-allowed opacity-55"
              : "cursor-pointer hover:bg-muted/25",
          )}
        >
          <Checkbox
            className="mt-0.5"
            checked={option.checked}
            onCheckedChange={(value) => option.onCheckedChange(value === true)}
            disabled={option.disabled}
          />
          <span className="min-w-0 space-y-0.5">
            <span className="block break-words font-medium text-foreground">
              {option.label}
            </span>
            <span className="block break-words text-mobile-caption leading-4 pc:text-xs">
              {option.description}
            </span>
            {option.unavailableReason ? (
              <span className="block break-words text-mobile-caption leading-4 text-amber-600 pc:text-xs dark:text-amber-400">
                {option.unavailableReason}
              </span>
            ) : null}
          </span>
        </label>
      ))}
    </div>
  );
}
