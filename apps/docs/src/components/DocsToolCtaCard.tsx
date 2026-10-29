import React from "react";

export type DocsToolCtaLink = {
  href: string;
  label: string;
};

export function DocsToolCtaCard(props: {
  title: React.ReactNode;
  description: React.ReactNode;
  primary: DocsToolCtaLink;
  secondary: DocsToolCtaLink;
}) {
  return (
    <aside className="not-prose mt-6 rounded-surface bg-secondary p-5 ring-1 ring-border/80">
      <div className="text-base font-bold leading-6 text-foreground">
        {props.title}
      </div>
      <div className="mt-1.5 text-sm leading-6 text-muted-foreground">
        {props.description}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={props.primary.href}
          className="inline-flex min-h-9 items-center justify-center rounded-control bg-foreground px-3 text-sm font-semibold text-background no-underline transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {props.primary.label}
        </a>
        <a
          href={props.secondary.href}
          className="inline-flex min-h-9 items-center text-sm font-semibold text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {props.secondary.label}
        </a>
      </div>
    </aside>
  );
}

