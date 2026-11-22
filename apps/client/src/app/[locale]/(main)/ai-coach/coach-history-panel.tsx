"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronRight,
  ListFilter,
  Search,
  History,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AI_COACH_SESSIONS_SIDEBAR_QUERY_KEY,
  deleteCoachSession,
  fetchCoachSessionsPage,
  invalidateCoachSessionLists,
  patchCoachSession,
  type CoachSessionListItem,
} from "@/api/ai-coach";
import { Button } from "@/components/ui/button";
import { MobileSidePage } from "@/components/mobile-app/components/MobileSidePage";
import { cn } from "@/lib/utils";
import { CoachHistoryDialogs } from "./CoachHistoryDialogs";
import { CoachHistorySessionRow } from "./CoachHistorySessionRow";
import {
  excludeEmptyCoachHistorySessions,
  getCoachHistoryLineText,
  groupCoachSessionsByHistoryBuckets,
  groupCoachSessionsByRecentBuckets,
} from "./coach-history-list-model";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { CoachSearchDialog } from "./coach-search-dialog";

const MOBILE_HISTORY_PAGE_TAKE = 30;

export function CoachSidebarHistoryList({
  activeSid,
  heading,
  onSelectSession,
  onSessionDeleted,
  onViewAll,
  onNewChat,
}: {
  activeSid: string;
  heading: ReactNode;
  onSelectSession: (sid: string) => void;
  onSessionDeleted: (sid: string) => void;
  onViewAll: () => void;
  onNewChat: () => void;
}) {
  const sidebarT = useTranslations("sidebar");
  const t = useTranslations("AiCoachPage.history");
  const tCoach = useTranslations("AiCoachPage");
  const demoText = useGuestAccessText();
  const publicDemo = usePublicDemo();
  const queryClient = useQueryClient();
  const [editSession, setEditSession] = useState<CoachSessionListItem | null>(
    null,
  );
  const [editTitleValue, setEditTitleValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CoachSessionListItem | null>(
    null,
  );

  useEffect(() => {
    if (editSession) {
      setEditTitleValue(getCoachHistoryLineText(editSession, ""));
    }
  }, [editSession]);

  const sidebarQuery = useQuery({
    queryKey: AI_COACH_SESSIONS_SIDEBAR_QUERY_KEY,
    queryFn: async () => {
      const page = await fetchCoachSessionsPage(0, 20);
      return page ?? { items: [], nextOffset: null };
    },
  });

  const sessions = excludeEmptyCoachHistorySessions(
    sidebarQuery.data?.items ?? [],
  );

  const [focused, setFocused] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const historyViewport = useRef<HTMLDivElement>(null);
  const historyEnd = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  useEffect(() => {
    const viewport = historyViewport.current;
    const end = historyEnd.current;
    if (!viewport || !end || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      setHasMoreBelow(!entry.isIntersecting);
    }, { root: viewport, rootMargin: "0px 0px 1px", threshold: 1 });
    observer.observe(end);
    return () => observer.disconnect();
  }, []);

  const pinned = sessions.filter((session) => session.pinnedAt);
  const recent = sessions.filter(
    (session) => !session.pinnedAt && (!focused || session.id === activeSid),
  );
  const groups = [
    ...(pinned.length > 0
      ? [{ key: "pinned", label: t("pinnedSection"), items: pinned }]
      : []),
    ...groupCoachSessionsByRecentBuckets(recent, {
      today: t("today"),
      yesterday: t("yesterday"),
      past: t("past"),
    }),
  ];

  const patchMutation = useMutation({
    mutationFn: (vars: {
      sid: string;
      body: { title?: string | null; pinned?: boolean };
      closeEdit?: boolean;
    }) => patchCoachSession(vars.sid, vars.body),
    onSuccess: (_data, vars) => {
      invalidateCoachSessionLists(queryClient);
      toast.success(t("toastUpdated"));
      if (vars.closeEdit) setEditSession(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("toastFailed"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (sid: string) => deleteCoachSession(sid),
    onSuccess: (ok, sid) => {
      if (!ok) {
        toast.error(t("toastFailed"));
        return;
      }
      invalidateCoachSessionLists(queryClient);
      toast.success(t("toastDeleted"));
      setDeleteTarget(null);
      onSessionDeleted?.(sid);
    },
    onError: () => {
      toast.error(t("toastFailed"));
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-0.5 px-1.5">
        <div className="min-w-0 flex-1">{heading}</div>
        <Button type="button" size="icon-compact" variant="ghost"
          className={cn("size-7 text-muted-foreground", focused && "bg-accent text-foreground")}
          aria-label={sidebarT("focusChats")} title={sidebarT("focusChats")}
          aria-pressed={focused} onClick={() => setFocused(!focused)}>
          <ListFilter aria-hidden="true" />
        </Button>
        <CoachSearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          sessions={sessions}
          onSelectSession={onSelectSession}
          onNewChat={publicDemo.active ? undefined : onNewChat}
          trigger={(
            <Button type="button" size="icon-compact" variant="ghost"
              className="size-7 text-muted-foreground" aria-label={sidebarT("searchChats")}
              title={sidebarT("searchChats")}>
              <Search aria-hidden="true" />
            </Button>
          )}
        />
      </div>
      <div className="shrink-0 px-1.5 pb-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-start gap-2 px-2 text-[13px] hover:bg-background/70"
          onClick={onNewChat}
          disabled={publicDemo.active}
          title={publicDemo.active ? demoText("aiReadOnly") : undefined}
        >
          <Plus aria-hidden="true" />
          {tCoach("actions.newChat")}
        </Button>
      </div>
      <div
        ref={historyViewport}
        className={cn(
          "min-h-0 flex-1 overflow-auto overscroll-y-contain scroll-pb-3.5 px-1.5",
          hasMoreBelow && "[mask-image:linear-gradient(to_bottom,black_calc(100%_-_14px),hsl(var(--black)/0.35))]",
        )}
      >
        {sidebarQuery.isPending ? (
          <div className="flex justify-center py-4 text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" role="status" aria-label={sidebarT("loadingChats")} />
          </div>
        ) : groups.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            {focused ? sidebarT("focusChatsEmpty") : t("empty")}
          </p>
        ) : (
          <div className="space-y-1 pb-1" data-coach-recent-history>
            {groups.map(({ key, label, items }) => (
              <Collapsible key={key} defaultOpen>
                <CollapsibleTrigger className="group flex h-7 w-full items-center gap-1.5 rounded-control px-2 text-start text-xs font-medium text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <ChevronRight className="size-3 shrink-0 group-data-[state=open]:rotate-90" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-0.5">
                  {items.map((session) => (
                    <CoachHistorySessionRow
                      key={session.id}
                      activeSid={activeSid}
                      lineText={getCoachHistoryLineText(session, t("untitled"))}
                      menuLabel={t("menuMore")}
                      onDelete={() => setDeleteTarget(session)}
                      onEdit={() => setEditSession(session)}
                      onPinToggle={() => patchMutation.mutate({
                        sid: session.id,
                        body: { pinned: !session.pinnedAt },
                      })}
                      onSelect={() => onSelectSession(session.id)}
                      readOnly={publicDemo.active}
                      session={session}
                      t={t}
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}
        <div ref={historyEnd} className="h-px" aria-hidden="true" />
      </div>
      {sessions.length > 0 ? (
        <div className="shrink-0 px-1.5 py-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-start gap-2 px-2 text-xs text-muted-foreground hover:bg-background/70"
            onClick={onViewAll}
          >
            <History aria-hidden="true" />
            {t("viewAll")}
          </Button>
        </div>
      ) : null}
      <CoachHistoryDialogs
        deletePending={deleteMutation.isPending}
        deleteTarget={deleteTarget}
        editSession={editSession}
        editTitleValue={editTitleValue}
        onConfirmDelete={() => {
          if (!deleteTarget) return;
          void deleteMutation.mutateAsync(deleteTarget.id);
        }}
        onConfirmEdit={() => {
          if (!editSession) return;
          patchMutation.mutate({
            sid: editSession.id,
            body: { title: editTitleValue.trim() || null },
            closeEdit: true,
          });
        }}
        onDeleteOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onEditOpenChange={(open) => {
          if (!open) setEditSession(null);
        }}
        onEditTitleValueChange={setEditTitleValue}
        t={t}
      />
    </div>
  );
}

function CoachMobileHistoryPanel({
  activeSid,
  onSelectSession,
  showHeader = true,
}: {
  activeSid: string;
  onSelectSession: (sid: string) => void;
  showHeader?: boolean;
}) {
  const t = useTranslations("AiCoachPage.history");
  const locale = useLocale();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const historyQuery = useInfiniteQuery({
    queryKey: [...AI_COACH_SESSIONS_SIDEBAR_QUERY_KEY, "mobile-full"],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const page = await fetchCoachSessionsPage(
        pageParam,
        MOBILE_HISTORY_PAGE_TAKE,
      );
      return page ?? { items: [], nextOffset: null };
    },
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.nextOffset != null ? last.nextOffset : undefined,
  });

  const sessions = useMemo(
    () =>
      excludeEmptyCoachHistorySessions(
        historyQuery.data?.pages.flatMap((page) => page.items) ?? [],
      ),
    [historyQuery.data?.pages],
  );

  const rows = useMemo(
    () =>
      groupCoachSessionsByHistoryBuckets(sessions, {
        today: t("today"),
        yesterday: t("yesterday"),
        last7Days: t("last7Days"),
        last30Days: t("last30Days"),
        month: (date) =>
          new Intl.DateTimeFormat(locale, {
            year: "numeric",
            month: "long",
          }).format(date.toDate()),
      }),
    [locale, sessions, t],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index]?.kind === "header" ? 34 : 52),
    overscan: 8,
  });

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const onScroll = () => {
      const nearBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight < 240;
      if (
        nearBottom &&
        historyQuery.hasNextPage &&
        !historyQuery.isFetchingNextPage
      ) {
        void historyQuery.fetchNextPage();
      }
    };

    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [historyQuery]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showHeader ? (
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-neutral-100 text-muted-foreground dark:bg-muted/45">
              <History className="h-4 w-4" />
            </span>
            <div className="truncate text-[15px] font-semibold tracking-tight text-foreground">
              {t("title")}
            </div>
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-2 py-2"
      >
        {historyQuery.isPending ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="rounded-surface border border-dashed border-border/70 bg-muted/25 px-3 py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;

              if (row.kind === "header") {
                return (
                  <div
                    key={row.key}
                    className="absolute left-0 top-0 w-full px-2 pb-1 pt-3"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div className="text-mobile-caption pc:text-[11px] font-medium text-muted-foreground">
                      {row.label}
                    </div>
                  </div>
                );
              }

              const title = getCoachHistoryLineText(row.session, t("untitled"));
              const isActive = row.session.id === activeSid;

              return (
                <div
                  key={row.key}
                  className="absolute left-0 top-0 w-full py-0.5"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <button
                    type="button"
                    className={cn(
                      "relative flex h-12 w-full min-w-0 items-center rounded-surface px-3 text-left text-sm leading-5 text-foreground transition-colors",
                      "before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full before:bg-transparent",
                      "hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-muted/45",
                      isActive &&
                        "bg-neutral-100 font-medium before:bg-foreground dark:bg-muted/45",
                    )}
                    onClick={() => onSelectSession(row.session.id)}
                    title={title}
                  >
                    <span className="truncate">{title}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {historyQuery.isFetchingNextPage ? (
          <div className="flex justify-center py-4 text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CoachHistoryMobileSheet({
  activeSid,
  onSelectSession,
  open,
  onOpenChange,
}: {
  activeSid: string;
  onSelectSession: (sid: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("AiCoachPage.history");

  const handleSelect = (sid: string) => {
    onSelectSession(sid);
    onOpenChange(false);
  };

  return (
    <MobileSidePage open={open} onOpenChange={onOpenChange} title={t("title")}>
      <CoachMobileHistoryPanel
        activeSid={activeSid}
        onSelectSession={handleSelect}
        showHeader={false}
      />
    </MobileSidePage>
  );
}
