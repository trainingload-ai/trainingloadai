import type { ReactNode } from "react";
import { ArrowRight, Plus } from "lucide-react";
import styles from "./calculators/tool-page.module.css";
import { TrackedLink } from "@/components/TrackedLink";
import { cn } from "@/lib/utils";

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
}: {
  children: ReactNode;
  maxWidth?: string;
  className?: string;
}) {
  return (
    <main className={cn(styles.page, className)}>
      <div className={cn(styles.shell, maxWidth)}>{children}</div>
    </main>
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
      <div className={styles.faq}>
        {items.map((item, idx) => (
          <details key={`${idx}-${item.question}`}>
            <summary>
              <span>{item.question}</span>
              <Plus className="size-5 shrink-0" aria-hidden />
            </summary>
            <div className={styles.answer}>{item.answer}</div>
          </details>
        ))}
      </div>
    </ToolSection>
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
