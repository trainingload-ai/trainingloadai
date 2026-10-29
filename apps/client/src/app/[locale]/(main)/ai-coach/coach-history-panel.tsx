"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  History,
  LoaderCircle,
  Pin,
  Plus,
  Sparkles,
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
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

const MOBILE_HISTORY_PAGE_TAKE = 30;

function HistoryListBody({
  activeSid,
  onSelectSession,
  onSessionDeleted,
  onViewAll,
  onOpenReview,
  onNewChat,
  className,
}: {
  activeSid: string;
  onSelectSession: (sid: string) => void;
  onSessionDeleted?: (sid: string) => void;
  /** 在主聊天页展开全量历史，不跳转路由 */
  onViewAll?: () => void;
  onOpenReview?: () => void;
  onNewChat?: () => void;
  className?: string;
}) {
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

  const pinnedSessions = useMemo(
    () =>
      sessions
        .filter((s) => Boolean(s.pinnedAt))
        .sort(
          (a, b) =>
            new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime(),
        ),
    [sessions],
  );

  const historyRows = useMemo(
    () =>
      groupCoachSessionsByRecentBuckets(
        sessions.filter((s) => !s.pinnedAt),
        {
          today: t("today"),
          yesterday: t("yesterday"),
          past: t("past"),
        },
      ),
    [sessions, t],
  );

  // 置顶分组默认收起；普通历史始终展示，避免侧栏内部再出现一层“历史对话”折叠。
  const [pinnedOpen, setPinnedOpen] = useState(false);

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
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {onOpenReview ? (
        <div className="shrink-0 px-3 pb-1 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="menu"
            className="w-full justify-start gap-2 font-medium text-neutral-700 shadow-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onClick={onOpenReview}
          >
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span>{t("openAiReview")}</span>
          </Button>
        </div>
      ) : null}
      {onNewChat ? (
        <div className={cn("shrink-0 px-3 pb-1", !onOpenReview && "pt-2")}>
          <Button
            type="button"
            variant="ghost"
            size="menu"
            className="w-full justify-start gap-2 font-medium text-neutral-700 shadow-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onClick={onNewChat}
            disabled={publicDemo.active}
            title={publicDemo.active ? demoText("aiReadOnly") : undefined}
            aria-label={tCoach("actions.newChat")}
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span>{tCoach("actions.newChat")}</span>
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto overscroll-y-contain">
        {sidebarQuery.isPending ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="mx-3 rounded-surface border border-dashed border-border/70 bg-muted/25 px-3 py-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="pb-3">
            {/* Pinned 分组：默认收起 */}
            {pinnedSessions.length > 0 ? (
              <div className="px-3 pb-1 pt-1">
                <Collapsible open={pinnedOpen} onOpenChange={setPinnedOpen}>
                  <button
                    type="button"
                    className={cn(
                      "flex min-h-10 w-full items-center justify-between rounded-surface px-3 py-2 text-left",
                      "text-mobile-caption pc:text-xs font-medium text-muted-foreground",
                      "transition-colors hover:bg-neutral-100 hover:text-foreground dark:hover:bg-neutral-800",
                    )}
                    onClick={(e) => {
                      // 只切换展开状态，不触发任何“选中会话/关闭面板”等上层点击逻辑
                      e.preventDefault();
                      e.stopPropagation();
                      setPinnedOpen((v) => !v);
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      <Pin className="h-3.5 w-3.5" />
                      {t("pinnedSection")}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        pinnedOpen ? "rotate-180" : "rotate-0",
                      )}
                    />
                  </button>
                  <CollapsibleContent>
                    <div className="mt-1 space-y-0.5">
                      {pinnedSessions.map((s) => {
                        const lineText = getCoachHistoryLineText(
                          s,
                          t("untitled"),
                        );
                        return (
                          <div key={s.id} className="py-0.5">
                            <CoachHistorySessionRow
                              activeSid={activeSid}
                              lineText={lineText}
                              menuLabel={t("menuMore")}
                              onDelete={() => setDeleteTarget(s)}
                              onEdit={() => setEditSession(s)}
                              onPinToggle={() => {
                                patchMutation.mutate({
                                  sid: s.id,
                                  body: { pinned: !s.pinnedAt },
                                });
                              }}
                              onSelect={() => onSelectSession(s.id)}
                              readOnly={publicDemo.active}
                              session={s}
                              t={t}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ) : null}

            {/* At most 20 recent sessions: normal flow keeps row spacing stable
                when new messages move sessions between date groups. */}
            <div className="w-full" data-coach-recent-history>
              {historyRows.map((row) => {
                if (row.kind === "header") {
                  return (
                    <div key={row.key} className="w-full px-6 pb-1 pt-3">
                      <div className="text-mobile-caption pc:text-[11px] font-medium text-muted-foreground">
                        {row.label}
                      </div>
                    </div>
                  );
                }
                const s = row.session;
                const lineText = getCoachHistoryLineText(s, t("untitled"));

                return (
                  <div key={row.key} className="w-full px-3 py-0.5">
                    <CoachHistorySessionRow
                      activeSid={activeSid}
                      lineText={lineText}
                      menuLabel={t("menuMore")}
                      onDelete={() => setDeleteTarget(s)}
                      onEdit={() => setEditSession(s)}
                      onPinToggle={() => {
                        patchMutation.mutate({
                          sid: s.id,
                          body: { pinned: !s.pinnedAt },
                        });
                      }}
                      onSelect={() => onSelectSession(s.id)}
                      readOnly={publicDemo.active}
                      session={s}
                      t={t}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {sessions.length > 0 && onViewAll ? (
        <div className="shrink-0 px-3 pb-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="menu"
            className="w-full justify-start gap-2 text-mobile-caption text-neutral-500 shadow-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 pc:text-xs"
            onClick={onViewAll}
          >
            <History className="h-4 w-4" />
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

export function CoachSidebarHistoryList({
  activeSid,
  onSelectSession,
  onSessionDeleted,
  onViewAll,
  onNewChat,
}: {
  activeSid: string;
  onSelectSession: (sid: string) => void;
  onSessionDeleted?: (sid: string) => void;
  onViewAll?: () => void;
  onNewChat?: () => void;
}) {
  return (
    <HistoryListBody
      activeSid={activeSid}
      onNewChat={onNewChat}
      onSelectSession={onSelectSession}
      onSessionDeleted={onSessionDeleted}
      onViewAll={onViewAll}
    />
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
