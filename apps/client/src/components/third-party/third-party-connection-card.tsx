"use client";

import type { ComponentType, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getThirdPartyProviderIconClassName,
  getThirdPartyProviderLogoFrameClassName,
  getThirdPartyProviderLogoSizeClassName,
} from "@deployment/provider-presentation";

export type ThirdPartyConnectionCardLayout = "grid" | "row";

export type ThirdPartyConnectionItem = {
  provider: string;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  connected?: boolean;
  connectedLabel?: string;
  showName?: boolean;
  actionLabel: string;
  loadingLabel?: string;
  isLoading?: boolean;
  disabled?: boolean;
  onAction: () => void;
  actionIcon?: ReactNode;
  actionSize?: ButtonProps["size"];
  actionVariant?: ButtonProps["variant"];
  extra?: ReactNode;
};

type ThirdPartyConnectionCardProps = ThirdPartyConnectionItem & {
  className?: string;
  layout?: ThirdPartyConnectionCardLayout;
};

type ThirdPartyConnectionListProps = {
  items: ThirdPartyConnectionItem[];
  className?: string;
  itemClassName?: string;
  layout?: ThirdPartyConnectionCardLayout;
};

export function thirdPartyProviderLogoFrameClassName(
  provider: string,
  connected: boolean,
  layout: ThirdPartyConnectionCardLayout = "grid",
) {
  return getThirdPartyProviderLogoFrameClassName(provider, connected, layout);
}

export function thirdPartyProviderLogoSizeClassName(
  provider: string,
  layout: ThirdPartyConnectionCardLayout = "grid",
) {
  return getThirdPartyProviderLogoSizeClassName(provider, layout);
}

export function thirdPartyProviderIconClassName(
  provider: string,
  connected: boolean,
) {
  return getThirdPartyProviderIconClassName(provider, connected);
}

function ConnectedStatusDot({ label }: { label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className="absolute right-3 top-3 z-10 shrink-0 rounded-full bg-[hsl(var(--emerald-500))]"
      style={{
        width: 10,
        height: 10,
        backgroundColor: "hsl(var(--emerald-500))",
      }}
    />
  );
}

function ConnectionStatusMark({
  label,
  pending,
}: {
  label?: string;
  pending: boolean;
}) {
  if (pending) {
    return (
      <span
        role="status"
        aria-label={label}
        className="absolute right-2.5 top-2.5 z-10 text-[hsl(var(--emerald-500))]"
      >
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      </span>
    );
  }
  return <ConnectedStatusDot label={label} />;
}

export function ThirdPartyConnectionCard({
  actionIcon,
  actionLabel,
  actionSize,
  actionVariant,
  className,
  connected = false,
  connectedLabel,
  description,
  disabled = false,
  extra,
  icon: Icon,
  isLoading = false,
  layout = "grid",
  loadingLabel,
  name,
  onAction,
  provider,
  showName = true,
}: ThirdPartyConnectionCardProps) {
  if (layout === "row") {
    return (
      <div
        className={cn(
          "relative flex flex-col gap-3 rounded-control-lg bg-background/70 p-3 transition-colors hover:bg-background sm:flex-row sm:items-center",
          className,
        )}
      >
        {connected ? (
          <ConnectionStatusMark label={connectedLabel} pending={isLoading} />
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className={cn(
              "flex h-10 shrink-0 items-center justify-center rounded-lg border",
              thirdPartyProviderLogoFrameClassName(provider, connected, layout),
            )}
          >
            <Icon
              className={cn(
                thirdPartyProviderLogoSizeClassName(provider, layout),
                thirdPartyProviderIconClassName(provider, connected),
              )}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "truncate text-sm font-semibold",
                  !showName && "sr-only",
                )}
              >
                {name}
              </div>
            </div>
            <p className="mt-1 line-clamp-2 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <Button
          className="shrink-0 sm:min-w-24"
          size={actionSize ?? "sm"}
          variant={actionVariant ?? (connected ? "outline" : "default")}
          disabled={disabled || isLoading}
          onClick={onAction}
        >
          {actionIcon}
          {isLoading && loadingLabel ? loadingLabel : actionLabel}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-md bg-background/80 p-3 dark:bg-background/35",
        className,
      )}
    >
      {connected ? (
        <ConnectionStatusMark label={connectedLabel} pending={isLoading} />
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={cn(
              "relative flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-md border",
              thirdPartyProviderLogoFrameClassName(provider, connected, layout),
            )}
          >
            <Icon
              className={cn(
                thirdPartyProviderLogoSizeClassName(provider, layout),
                thirdPartyProviderIconClassName(provider, connected),
              )}
            />
          </div>
          <div
            className={cn(
              "truncate text-sm font-medium",
              !showName && "sr-only",
            )}
          >
            {name}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-1 flex-col gap-4">
        <p className="text-mobile-caption text-muted-foreground pc:text-xs">
          {description}
        </p>
        {extra}
        <div className="mt-auto flex justify-end">
          <Button
            type="button"
            variant={actionVariant ?? (connected ? "outline" : "default")}
            onClick={onAction}
            size={actionSize ?? "xs"}
            disabled={disabled || isLoading}
          >
            {isLoading && loadingLabel ? loadingLabel : actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ThirdPartyConnectionList({
  className,
  itemClassName,
  items,
  layout = "grid",
}: ThirdPartyConnectionListProps) {
  return (
    <div className={className}>
      {items.map((item) => (
        <ThirdPartyConnectionCard
          key={item.provider}
          {...item}
          className={itemClassName}
          layout={layout}
        />
      ))}
    </div>
  );
}
