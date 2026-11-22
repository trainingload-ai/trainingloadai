"use client";

import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type CoachNavigationCardProps = {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
} & ({ href: string; onOpen?: never } | { onOpen: () => void; href?: never });

export function CoachNavigationCard({
  icon: Icon,
  title,
  subtitle,
  href,
  onOpen,
}: CoachNavigationCardProps) {
  const content = (
    <>
      <Icon aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate leading-4">{title}</span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
      <ArrowUpRight aria-hidden />
    </>
  );
  const className =
    "min-h-14 w-full max-w-sm justify-start gap-3 bg-muted px-3 py-2.5 text-start hover:bg-accent";

  return href ? (
    <Button asChild variant="ghost" size="auto" className={className}>
      <Link href={href}>{content}</Link>
    </Button>
  ) : (
    <Button
      type="button"
      variant="ghost"
      size="auto"
      className={className}
      onClick={onOpen}
    >
      {content}
    </Button>
  );
}
