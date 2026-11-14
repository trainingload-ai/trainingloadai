import type { ComponentProps, ReactNode } from "react";
import { ArrowRight, Plus } from "lucide-react";
import styles from "./calculators/tool-page.module.css";
import { TrackedLink } from "@/components/TrackedLink";
import { cn } from "@/lib/utils";
import {
  ToolCatalogCard,
  type ToolCatalogCardProps,
} from "@/components/ToolCatalogCard";

export type ToolJumpLink = {
  href: string;
  label: string;
};

export type ToolRelatedLink = {
  href: string;
  label: string;
};

export type ToolHowToStep = {
  title: string;
  body: string;
};

export function ToolPageMain({
  children,
  maxWidth = "max-w-6xl",
  className,
  as: Container = "main",
}: {
  children: ReactNode;
  maxWidth?: string;
  className?: string;
  as?: "main" | "div";
}) {
  return (
    <Container className={cn(styles.page, className)}>
      <div className={cn(styles.shell, maxWidth)}>{children}</div>
    </Container>
  );
}

export function ToolHero({
  badge,
  title,
  subtitle,
  primary,
  secondary,
  visual,
  children,
}: {
  badge: string;
  title: string;
  subtitle: string;
  primary?: ToolRelatedLink;
  secondary?: ToolRelatedLink;
  visual?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className={cn(styles.hero, visual && styles.split)}>
      <div className={styles.intro}>
        <p className={styles.kicker}>{badge}</p>
        <h1>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
        {(primary || secondary) && (
          <div className={styles.actions}>
            {[primary, secondary].map((link, index) =>
              link ? (
                <TrackedLink
                  key={link.href}
                  href={link.href}
                  className={cn(styles.button, index === 0 && styles.primary)}
                  eventName="marketing_cta_clicked"
                  eventProperties={{
                    href: link.href,
                    label: link.label,
                    location: "tool_hero",
                  }}
                >
                  {link.label}
                  {index === 0 && <ArrowRight className="size-4" aria-hidden />}
                </TrackedLink>
              ) : null,
            )}
          </div>
        )}
        {children}
      </div>
      {visual && <div className={styles.heroVisual}>{visual}</div>}
    </header>
  );
}

export function ToolJumpNav({ links }: { links: ToolJumpLink[] }) {
  if (links.length === 0) return null;

  return (
    <nav aria-label="On this page" className={styles.jumpNav}>
      {links.map((link) => (
        <a key={link.href} href={link.href} className={styles.jumpLink}>
          {link.label}
        </a>
      ))}
    </nav>
  );
}

export function ToolSection({
  id,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn(styles.section, className)}>
      <div className="space-y-2">
        <h2 className={styles.sectionTitle}>{title}</h2>
        {description && (
          <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export function ToolCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(styles.card, className)}>{children}</div>;
}

export function ToolHowToSection({
  id = "how-to",
  title,
  steps,
}: {
  id?: string;
  title: string;
  steps: ToolHowToStep[];
}) {
  if (steps.length === 0) return null;

  return (
    <ToolSection id={id} title={title}>
      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <ToolCard key={`${index}-${step.title}`}>
            <div className="mb-3 grid size-8 place-items-center rounded-compact bg-neutral-950 font-mono text-sm font-black text-white dark:bg-white dark:text-neutral-950">
              {index + 1}
            </div>
            <h3 className="text-base font-bold text-neutral-950 dark:text-white">
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              {step.body}
            </p>
          </ToolCard>
        ))}
      </div>
    </ToolSection>
  );
}

export function ToolFaqSection({
  id = "faq",
  title,
  items,
}: {
  id?: string;
  title: string;
  items: Array<{ question: string; answer: string }>;
}) {
  if (items.length === 0) return null;

  return (
    <ToolSection id={id} title={title}>
      <ToolFaqList>
        {items.map((item, idx) => (
          <ToolFaqItem key={`${idx}-${item.question}`} question={item.question}>
            {item.answer}
          </ToolFaqItem>
        ))}
      </ToolFaqList>
    </ToolSection>
  );
}

export function ToolFaqList({ children }: { children: ReactNode }) {
  return (
    <div className={styles.faq} data-slot="tool-faq-list">
      {children}
    </div>
  );
}

export function ToolFaqItem({
  question,
  children,
  ...props
}: Omit<ComponentProps<"details">, "children"> & {
  question: ReactNode;
  children: ReactNode;
}) {
  return (
    <details {...props} data-slot="tool-faq-item">
      <summary>
        <span>{question}</span>
        <Plus className="size-5 shrink-0" aria-hidden />
      </summary>
      <div className={styles.answer}>{children}</div>
    </details>
  );
}

export function ToolRelatedLinks({
  title,
  links,
}: {
  title: string;
  links: ToolRelatedLink[];
}) {
  if (links.length === 0) return null;

  return (
    <ToolSection title={title}>
      <div className={styles.related}>
        {links.map((link) => (
          <TrackedLink
            key={link.href}
            href={link.href}
            eventName="related_tool_clicked"
            eventProperties={{
              href: link.href,
              label: link.label,
              location: "tool_related_links",
            }}
            className={styles.relatedLink}
          >
            <span className="flex items-center gap-2">{link.label}</span>
            <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
          </TrackedLink>
        ))}
      </div>
    </ToolSection>
  );
}

export function ToolRelatedCards({
  id,
  title,
  items,
  more,
}: {
  id?: string;
  title: string;
  items: ToolCatalogCardProps[];
  more?: ToolRelatedLink;
}) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        styles.bleed,
        "bg-secondary/55 px-4 py-12 dark:bg-background md:px-6 md:py-16",
      )}
    >
      <div className={styles.shell}>
        <section id={id} className={styles.section}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className={styles.sectionTitle}>{title}</h2>
            {more ? (
              <TrackedLink
                href={more.href}
                eventName="related_tool_clicked"
                eventProperties={{
                  href: more.href,
                  label: more.label,
                  location: "tool_related_links",
                }}
                className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                {more.label}
                <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
              </TrackedLink>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <ToolCatalogCard
                key={item.href}
                {...item}
                eventName="related_tool_clicked"
                eventProperties={{
                  href: item.href,
                  label: item.title,
                  location: "tool_related_links",
                }}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
