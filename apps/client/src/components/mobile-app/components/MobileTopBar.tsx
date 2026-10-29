"use client";

import { Slot } from "@radix-ui/react-slot";
import * as React from "react";

import { cn } from "@/lib/utils";

type MobileTopBarPlacement = "screen" | "inline" | "sheet";
type MobileTopBarEdge = "leading" | "trailing";
type MobileTopBarTitleElement = "h1" | "h2" | "div";

/** Matches the tab bar content row so the chrome does not feel squat. */
export const MOBILE_TOP_BAR_CONTENT_CLASS = "h-14";

export const mobileTopBarActionClassName =
  "tap-feedback relative grid size-11 shrink-0 place-items-center rounded-control text-foreground transition-colors hover:bg-brand-soft active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[22px] [&_svg]:shrink-0";

export function MobileTopBar({
  title,
  subtitle,
  leading,
  trailing,
  placement = "screen",
  titleAs: Title = "h1",
  titleId,
  descriptionId,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  placement?: MobileTopBarPlacement;
  titleAs?: MobileTopBarTitleElement;
  titleId?: string;
  descriptionId?: string;
  className?: string;
}) {
  const screen = placement === "screen";

  return (
    <header
      data-mobile-top-bar
      data-placement={placement}
      className={cn(
        "isolate shrink-0 border-b border-white/35 bg-background/95 shadow-[0_1px_0_var(--border)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/65 dark:border-white/10 dark:bg-background/90 dark:supports-[backdrop-filter]:bg-background/55 tablet:hidden",
        screen
          ? "absolute inset-x-0 top-0 z-30 h-[calc(env(safe-area-inset-top,0px)+56px)]"
          : "relative z-10",
        placement === "inline" && "pt-[env(safe-area-inset-top,0px)]",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto grid w-full max-w-xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-1",
          MOBILE_TOP_BAR_CONTENT_CLASS,
          screen && "absolute inset-x-0 top-[env(safe-area-inset-top,0px)]",
        )}
      >
        <div className="flex items-center justify-start">{leading}</div>
        <div className="min-w-0 px-2 text-center">
          <Title
            id={titleId}
            className="truncate text-mobile-headline font-semibold leading-tight flex justify-center items-center"
          >
            {title}
          </Title>
          {subtitle ? (
            <p
              id={descriptionId}
              className="truncate text-mobile-caption leading-tight text-muted-foreground"
            >
              {subtitle}
            </p>
          ) : descriptionId ? (
            <span id={descriptionId} className="sr-only">
              {title}
            </span>
          ) : null}
        </div>
        <div className="flex items-center justify-end">{trailing}</div>
      </div>
    </header>
  );
}

export function MobileTopBarContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"main">) {
  return (
    <main
      data-mobile-top-bar-content
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain pt-[calc(env(safe-area-inset-top,0px)+56px)] outline-none tablet:pt-0",
        className,
      )}
      {...props}
    />
  );
}

export function MobileTopBarAction({
  asChild = false,
  edge,
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  edge?: MobileTopBarEdge;
}) {
  const Component = asChild ? Slot : "button";

  return (
    <Component
      data-mobile-top-bar-action
      type={asChild ? undefined : type}
      className={cn(
        mobileTopBarActionClassName,
        edge === "leading" && "-ml-0.5",
        edge === "trailing" && "-mr-0.5",
        className,
      )}
      {...props}
    />
  );
}
