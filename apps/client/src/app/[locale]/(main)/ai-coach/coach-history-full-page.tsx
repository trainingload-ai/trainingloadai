"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { getLoginHrefWithCallback } from "@/lib/auth-callback";
import { cn } from "@/lib/utils";
import {
  AI_COACH_SESSIONS_HISTORY_QUERY_KEY,
  deleteCoachSession,
  fetchCoachSessionsPage,
  invalidateCoachSessionLists,
  patchCoachSession,
  type CoachSessionListItem,
} from "@/api/ai-coach";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CoachHistoryFullPageSessionRow } from "./CoachHistoryFullPageSessionRow";
import {
  excludeEmptyCoachHistorySessions,
  getCoachHistoryLineText,
  getCoachHistoryReplyPreview,
} from "./coach-history-list-model";

/** 列表项固定高度（DOM 与虚拟列表 estimate 必须一致） */
const LIST_ITEM_HEIGHT_PX = 90;
const PAGE_TAKE = 25;

/** 与主聊天区同量级版心，列表略收窄更易读 */
const historyColumnClass =
  "mx-auto w-full max-w-lg px-3 sm:max-w-2xl sm:px-5 lg:max-w-3xl";

export type CoachHistoryFullPageProps = {
  /** 嵌在主聊天页：不覆盖 document.title */
  embedded?: boolean;
  /** 左上角返回（关闭全量列表） */
  onBack?: () => void;
  /** 选中会话；调用方负责同时退出历史视图，避免产生两次相互竞争的导航 */
  onPickSession?: (sid: string) => void;
  onSessionDeleted?: (sid: string) => void;
  /** 当前打开的对话 id，用于列表轻量高亮 */
  activeSid?: string;
};

export function CoachHistoryFullPage({
  embedded = false,
  onBack,
  onPickSession,
  onSessionDeleted,
  activeSid,
}: CoachHistoryFullPageProps = {}) {
  const t = useTranslations("AiCoachPage.history");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: authSession } = useViewerSession();
  const publicDemo = usePublicDemo();

  useEffect(() => {
    if (embedded) return;
    const prev = document.title;
    document.title = t("fullPageTitle");
    return () => {
      document.title = prev;
    };
  }, [embedded, t]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [editSession, setEditSession] = useState<CoachSessionListItem | null>(
    null,
  );
  const [editTitleValue, setEditTitleValue] = useState("");

  useEffect(() => {
    if (editSession) {
      setEditTitleValue(getCoachHistoryLineText(editSession, ""));
    }
  }, [editSession]);

  const infinite = useInfiniteQuery({
    queryKey: AI_COACH_SESSIONS_HISTORY_QUERY_KEY,
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const page = await fetchCoachSessionsPage(pageParam, PAGE_TAKE);
      return page ?? { items: [], nextOffset: null };
    },
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.nextOffset != null ? last.nextOffset : undefined,
    enabled: Boolean(authSession?.user?.id),
  });

  const sessions = useMemo(
    () =>
      excludeEmptyCoachHistorySessions(
        infinite.data?.pages.flatMap((p) => p.items) ?? [],
      ),
    [infinite.data?.pages],
  );

  const virtualizer = useVirtualizer({
    count: sessions.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LIST_ITEM_HEIGHT_PX,
    overscan: 6,
  });

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
    onSuccess: (ok, deletedSid) => {
      if (!ok) {
        toast.error(t("toastFailed"));
        return;
      }
      invalidateCoachSessionLists(queryClient);
      toast.success(t("toastDeleted"));
      onSessionDeleted?.(deletedSid);
    },
    onError: () => {
      toast.error(t("toastFailed"));
    },
  });

  const requestDelete = useCallback(
    (s: CoachSessionListItem) => {
      toast.message(t("deleteConfirmTitle"), {
        description: t("deleteConfirmDescription"),
        duration: 12_000,
        action: {
          label: t("deleteConfirm"),
          onClick: () => {
            void deleteMutation.mutateAsync(s.id);
          },
        },
        cancel: {
          label: t("cancel"),
          onClick: () => {},
        },
      });
    },
    [deleteMutation, t],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (nearBottom && infinite.hasNextPage && !infinite.isFetchingNextPage) {
        void infinite.fetchNextPage();
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [infinite]);

  const openSession = useCallback(
    (sessionId: string) => {
      if (onPickSession) {
        onPickSession(sessionId);
        return;
      }
      router.push(`/ai-coach?sid=${encodeURIComponent(sessionId)}`);
    },
    [onPickSession, router],
  );

  if (!authSession?.user?.id) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
        <p>{t("loginToView")}</p>
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={getLoginHrefWithCallback()}>{t("goSignIn")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border/80 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
        <div
          className={cn(
            historyColumnClass,
            "flex items-center gap-1 py-2.5 sm:py-3",
          )}
        >
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={onBack}
              aria-label={t("backToCoach")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : null}
          <h1 className="min-w-0 flex-1 text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {t("fullPageTitle")}
          </h1>
        </div>
      </header>

      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain",
          "bg-background",
        )}
      >
        <div className={cn(historyColumnClass, "pb-6 pt-2 sm:pt-3")}>
          {infinite.isPending ? (
            <div className="flex justify-center py-20 text-muted-foreground">
              <LoaderCircle className="h-8 w-8 animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/70 bg-muted/25 py-14 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <div
              className="relative w-full"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((vi) => {
                const s = sessions[vi.index];
                if (!s) return null;
                const title = getCoachHistoryLineText(s, t("untitled"));
                const replyPreview =
                  getCoachHistoryReplyPreview(s) ?? t("noReply");

                const isRowActive = Boolean(activeSid && s.id === activeSid);

                return (
                  <div
                    key={s.id}
                    className="absolute left-0 top-0 box-border w-full pt-1.5 pb-1.5"
                    style={{
                      height: LIST_ITEM_HEIGHT_PX,
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    <CoachHistoryFullPageSessionRow
                      active={isRowActive}
                      deleteAriaLabel={t("deleteAria")}
                      deletePending={deleteMutation.isPending}
                      editAriaLabel={t("editTitleAria")}
                      onDelete={() => requestDelete(s)}
                      onEdit={() => setEditSession(s)}
                      onOpen={() => openSession(s.id)}
                      onTogglePin={() => {
                        patchMutation.mutate({
                          sid: s.id,
                          body: { pinned: !s.pinnedAt },
                        });
                      }}
                      pinAriaLabel={t("pinAria")}
                      replyPreview={replyPreview}
                      readOnly={publicDemo.active}
                      session={s}
                      title={title}
                      unpinAriaLabel={t("unpinAria")}
                    />
                  </div>
                );
              })}
            </div>
          )}
          {infinite.isFetchingNextPage ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <LoaderCircle className="h-5 w-5 animate-spin" />
            </div>
          ) : null}
        </div>
      </div>

      <Dialog
        open={!!editSession}
        onOpenChange={(o) => !o && setEditSession(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editTitleDialogTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            disabled={publicDemo.active}
            value={editTitleValue}
            onChange={(e) => setEditTitleValue(e.target.value)}
            placeholder={t("editTitlePlaceholder")}
            maxLength={200}
            className="mt-2"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (editSession) {
                  patchMutation.mutate({
                    sid: editSession.id,
                    body: { title: editTitleValue.trim() || null },
                    closeEdit: true,
                  });
                }
              }
            }}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditSession(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={publicDemo.active || patchMutation.isPending}
              onClick={() => {
                if (!editSession) return;
                patchMutation.mutate({
                  sid: editSession.id,
                  body: { title: editTitleValue.trim() || null },
                  closeEdit: true,
                });
              }}
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
