import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import type { ComponentProps, CSSProperties } from "react";
import { TrackedLink } from "@/components/TrackedLink";

export type ToolCatalogCardProps = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  signal: string;
  tone?: string;
  toolKey?: string;
  headingLevel?: "h3" | "h4";
  output: { label: string; value: string };
  eventName?: string;
  eventProperties?: ComponentProps<typeof TrackedLink>["eventProperties"];
};

export function toolToneStyle(tone: string): CSSProperties {
  return {
    "--tool-tone": tone,
    "--tool-tone-soft": `color-mix(in srgb, ${tone} 12%, var(--card))`,
    "--tool-tone-strong": `color-mix(in srgb, ${tone} 50%, var(--foreground))`,
  } as CSSProperties;
}

export function ToolCatalogCard({
  href,
  title,
  description,
  icon: Icon,
  signal,
  tone = "var(--muted-foreground)",
  toolKey,
  headingLevel: Heading = "h3",
  output,
  eventName,
  eventProperties,
}: ToolCatalogCardProps) {
  const linkProps = {
    href,
    "data-tool-key": toolKey,
    "data-slot": "tool-catalog-card",
    style: toolToneStyle(tone),
    className:
      "group flex min-h-[11rem] min-w-0 flex-col rounded-overlay bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-secondary motion-reduce:transform-none dark:bg-secondary/75 dark:hover:bg-secondary",
  };
  const content = (
    <>
      <div className="flex items-start gap-2.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-control-lg bg-[var(--tool-tone-soft)] text-[var(--tool-tone-strong)]">
          <Icon aria-hidden="true" className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Heading className="line-clamp-2 text-sm font-semibold leading-5">
              {title}
            </Heading>
            <ArrowRight
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transform-none"
            />
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--tool-tone-strong)]">
            {signal}
          </div>
        </div>
      </div>
      <p className="mt-3 line-clamp-3 text-[12.5px] leading-5 text-muted-foreground">
        {description}
      </p>
      <div className="mt-auto flex items-center gap-2 pt-4 text-[11px] text-muted-foreground">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-[var(--tool-tone)]"
        />
        <span className="font-semibold uppercase tracking-[0.1em]">
          {output.label}
        </span>
        <span className="ml-auto max-w-[68%] truncate font-medium text-foreground/70">
          {output.value}
        </span>
      </div>
    </>
  );

  return eventName ? (
    <TrackedLink
      {...linkProps}
      eventName={eventName}
      eventProperties={eventProperties}
    >
      {content}
    </TrackedLink>
  ) : (
    <Link {...linkProps}>{content}</Link>
  );
}
