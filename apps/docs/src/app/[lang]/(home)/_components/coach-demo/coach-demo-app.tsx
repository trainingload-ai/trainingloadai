"use client";

import { useMemo, useState } from "react";
import { ArrowUp, History, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveDemoCopy } from "@/lib/demo-i18n";

import { coachDemoCopy } from "./copy";
import { DemoThread } from "./demo-thread";
import type { CoachDemoCopy, CoachDemoSession } from "./types";

function bucketLabel(copy: CoachDemoCopy, bucket: CoachDemoSession["bucket"]) {
  if (bucket === "today") return copy.today;
  if (bucket === "yesterday") return copy.yesterday;
  return copy.past;
}

function DemoSessionRow({
  title,
  active,
  onClick,
  interactive,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative flex w-full min-w-0 items-center gap-0.5 rounded-compact px-1.5 py-1.5 transition-[background-color,box-shadow,color] duration-150",
        "before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full before:bg-transparent",
        interactive &&
          "hover:bg-neutral-100 hover:text-foreground dark:hover:bg-muted/45",
        active
          ? "bg-neutral-100 text-foreground before:bg-foreground dark:bg-muted/45"
          : "text-foreground",
      )}
    >
      <button
        type="button"
        disabled={!interactive}
        className={cn(
          "min-w-0 flex-1 rounded-compact px-1 py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          interactive ? "cursor-pointer" : "cursor-default",
        )}
        onClick={interactive ? onClick : undefined}
      >
        <div
          className={cn(
            "truncate text-sm leading-5 text-foreground",
            active && "font-medium",
          )}
        >
          {title}
        </div>
      </button>
    </div>
  );
}

export function CoachDemoApp({
  lang,
  interactive = false,
}: {
  lang: string;
  interactive?: boolean;
}) {
  const copy = resolveDemoCopy(coachDemoCopy, lang);
  const [activeSessionId, setActiveSessionId] = useState(
    copy.sessions[0]?.id ?? "",
  );

  const activeSession = useMemo(
    () =>
      copy.sessions.find((session) => session.id === activeSessionId) ??
      copy.sessions[0]!,
    [activeSessionId, copy.sessions],
  );

  const groupedSessions = useMemo(() => {
    const order: CoachDemoSession["bucket"][] = ["today", "yesterday", "past"];
    return order
      .map((bucket) => ({
        bucket,
        label: bucketLabel(copy, bucket),
        sessions: copy.sessions.filter((session) => session.bucket === bucket),
      }))
      .filter((group) => group.sessions.length > 0);
  }, [copy]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border/70 bg-background">
        <div className="shrink-0 px-3 pb-2 pt-3">
          <div className="flex h-9 w-full items-center justify-start gap-2 rounded-compact px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-neutral-100 dark:hover:bg-muted/45">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span>{copy.review}</span>
          </div>
        </div>
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-compact text-muted-foreground">
              <History className="h-3.5 w-3.5" />
            </span>
            <div className="truncate text-[15px] font-semibold tracking-tight text-foreground">
              {copy.history}
            </div>
          </div>
        </div>
        <div className="shrink-0 px-3 pb-2">
          <button
            type="button"
            disabled={interactive}
            className={cn(
              "flex h-9 w-full items-center justify-start gap-2 rounded-compact px-2.5 text-sm font-medium transition-colors",
              interactive
                ? "cursor-not-allowed text-muted-foreground/70"
                : "text-foreground hover:bg-neutral-100 dark:hover:bg-muted/40",
            )}
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span>{copy.newChat}</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto overscroll-y-contain px-1 pb-3">
          {groupedSessions.map((group) => (
            <div key={group.bucket} className="pb-1 pt-1">
              <div className="px-4 pt-3">
                <div className="text-[11px] font-medium text-muted-foreground">
                  {group.label}
                </div>
              </div>
              <div className="mt-1 space-y-0.5 px-2">
                {group.sessions.map((session) => (
                  <DemoSessionRow
                    key={session.id}
                    title={session.title}
                    active={session.id === activeSession.id}
                    interactive={interactive}
                    onClick={() => setActiveSessionId(session.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-transparent px-3 py-4 sm:px-5 sm:py-6">
          <DemoThread session={activeSession} copy={copy} />
        </div>
        <footer className="z-20 shrink-0 border-t border-border/70 bg-background/95 sm:backdrop-blur">
          <div className="mx-auto w-full max-w-lg space-y-2 px-2 pb-1 pt-2 sm:max-w-[920px] sm:space-y-3 sm:px-3">
            <div className="rounded-compact border border-border/70 bg-background/95 p-2 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
              <div className="min-h-14 rounded-xs px-2 py-1.5 text-sm leading-6 text-muted-foreground">
                {activeSession.composer}
              </div>
              <div className="mt-2 flex items-center justify-end gap-3 border-t border-border pt-2 sm:justify-between">
                <div className="hidden flex-1 text-xs text-muted-foreground sm:block">
                  {copy.composerHint}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    {copy.thinking}
                  </span>
                  <button
                    type="button"
                    disabled={interactive}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-compact px-3 text-xs font-semibold",
                      interactive
                        ? "cursor-not-allowed bg-neutral-200 text-muted-foreground dark:bg-muted/60"
                        : "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950",
                    )}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    {copy.send}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
