import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
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
  imageSrc,
  imageAlt,
  className,
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  imageSrc?: string;
  imageAlt?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-h-full flex-col overflow-hidden rounded-control border border-fd-border bg-fd-card text-fd-card-foreground transition-colors",
        "hover:border-fd-primary/45 hover:bg-fd-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
        className,
      )}
    >
      {imageSrc ? (
        <div className="relative aspect-[16/8.4] overflow-hidden border-b border-fd-border bg-neutral-950">
          <Image
            src={imageSrc}
            alt={imageAlt ?? ""}
            fill
            sizes="(min-width: 768px) 420px, 100vw"
            className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.015] motion-reduce:transform-none motion-reduce:transition-none"
          />
        </div>
      ) : null}

      <div className="flex flex-1 flex-col p-5">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-fd-muted-foreground">
          {eyebrow}
        </span>
        <h2 className="mt-2 text-lg font-semibold leading-snug text-fd-foreground">
          {title}
        </h2>
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
