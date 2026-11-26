"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { CalendarClock, ChevronRight, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PlanProposalPresentation } from "@shared/plan-proposal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const countKeys = ["changed", "added", "deleted", "preserved", "skipped"] as const;

export function CoachPlanReviewCard({ proposal, status, children, footer }: {
  proposal: PlanProposalPresentation;
  status: string;
  children: ReactNode;
  footer?: ReactNode | ((close: () => void) => ReactNode);
}) {
  const t = useTranslations("AiCoachPage.decision");
  const counts = countKeys.map((key) => ({
    key,
    count: proposal.counts[key] ?? 0,
  })).filter(({ key, count }) => count > 0 || key === "changed" || key === "preserved");
  return <CoachReviewCard title={proposal.title} summary={proposal.summary} status={status}
    icon={CalendarClock} cardKind="plan-review" footer={footer}
    facts={counts.map(({ key, count }) => (
      <span key={key} className="text-muted-foreground">
        {t(key)} <span className="font-semibold tabular-nums text-foreground">{count}</span>
      </span>
    ))}>
    {children}
  </CoachReviewCard>;
}

export function CoachReviewCard({ title: heading, summary, status, icon: Icon, cardKind, facts, children, footer }: {
  title: string;
  summary?: string;
  status: string;
  icon: LucideIcon;
  cardKind: string;
  facts: ReactNode;
  children: ReactNode;
  footer?: ReactNode | ((close: () => void) => ReactNode);
}) {
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" data-coach-card={cardKind} className="w-full min-w-0 space-y-2.5 rounded-control bg-muted/75 p-3 text-start hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex items-start gap-2.5">
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-semibold">{heading}</span>
              {summary ? <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{summary}</span> : null}
            </span>
            <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
          </span>
          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border/70 pt-2 text-xs">
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {facts}
            </span>
            <span className="text-muted-foreground">{status}</span>
          </span>
        </button>
      </DialogTrigger>
      <DialogContent
        aria-labelledby={titleId}
        className="flex flex-col gap-0 overflow-hidden p-0 pc:max-w-3xl pc:p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          title.current?.focus();
        }}
      >
        <DialogHeader className="shrink-0 p-4 pe-16 text-start pc:px-6 pc:pt-6">
          <DialogTitle id={titleId} ref={title} tabIndex={-1} className="break-words outline-none">{heading}</DialogTitle>
          <DialogDescription>{summary || status}</DialogDescription>
        </DialogHeader>
        <div tabIndex={0} role="region" aria-labelledby={titleId} className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring pc:px-6">
          {children}
        </div>
        {footer ? (
          <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-end border-t border-border/70 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pc:px-6">
            {typeof footer === "function" ? footer(() => setOpen(false)) : footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
