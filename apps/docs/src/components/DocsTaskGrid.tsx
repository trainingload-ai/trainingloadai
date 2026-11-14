"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { DocsScreenshotVisual } from "@/components/DocsScreenshotVisual";
import { resolveDocsScreenshot } from "@/lib/docs-screenshot";
import { cn } from "@/lib/cn";

export function DocsTaskGrid({ children }: { children: ReactNode }) {
  return (
    <div className="not-prose my-8 grid gap-4 md:grid-cols-2">{children}</div>
  );
}

export function DocsTaskCard({
  href,
  eyebrow,
  title,
  description,
  action,
  screenshotId,
  imageAlt,
  preload = false,
  className,
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  screenshotId: string;
  imageAlt?: string;
  preload?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("docsScreenshot");
  const { desktop, mobile, destination } = resolveDocsScreenshot({
    id: screenshotId,
    locale,
  });
  return (
    <Link
      href={href}
      data-docs-task-card={screenshotId}
      className={cn(
        "group flex min-h-full flex-col overflow-hidden rounded-control border border-fd-border bg-fd-card text-fd-card-foreground transition-colors",
        "hover:border-fd-primary/45 hover:bg-fd-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
        className,
      )}
    >
      {desktop || mobile ? (
        <div className="border-b border-fd-border bg-fd-muted/30 p-3">
          <DocsScreenshotVisual
            desktop={desktop}
            mobile={mobile}
            address={destination.address}
            imageAlt={imageAlt ?? title}
            webLabel={t("webPlatform")}
            mobileLabel={t("mobilePlatform")}
            preload={preload}
            imageWidth={320}
          />
        </div>
      ) : null}

      <div className="flex flex-1 flex-col p-5">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-fd-muted-foreground">
          {eyebrow}
        </span>
        <h3 className="mt-2 text-lg font-semibold leading-snug text-fd-foreground">
          {title}
        </h3>
        <p className="mt-2 flex-1 text-sm leading-6 text-fd-muted-foreground">
          {description}
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-fd-primary">
          {action}
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
          />
        </span>
      </div>
    </Link>
  );
}
