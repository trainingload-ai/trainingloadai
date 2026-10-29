"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  fetchCoachSessionsPage,
  type CoachSessionListItem,
} from "@/api/ai-coach";
import { Button } from "@/components/ui/button";
import { dayjs } from "@/lib/dayjs-tz";
import { resolveUserDisplayTimezone } from "@/lib/user-timezone";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  instantInUserTz,
  resolveReviewDate,
  type ReviewScope,
} from "./coach-review-session-meta";
import { queryKeys } from "@/lib/query-keys";

function ReviewDeckCardFace({
  scope,
  session,
  timeZone,
}: {
  scope: ReviewScope;
  session: CoachSessionListItem;
  timeZone: string;
}) {
  const t = useTranslations("AiCoachPage.reviews");
  const locale = useLocale();
  const ps = session.periodStart ?? null;
  const pe = session.periodEnd ?? null;

  /** 周复盘：ISO 周序号 + 自然周起止（按用户档案时区解释 period） */
  if (scope === "weekly" && ps && pe) {
    const start = instantInUserTz(ps, timeZone);
    const endBoundary = instantInUserTz(pe, timeZone);
    if (!start || !endBoundary) return null;
    const endIncl = endBoundary.subtract(1, "day");
    const week = start.isoWeek();
    const year = start.isoWeekYear();
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg bg-neutral-100/90 text-foreground dark:bg-muted/45">
        <div className="text-mobile-caption pc:text-[11px] font-medium tracking-wide text-muted-foreground">
          {t("cardYearMeta", { year })}
        </div>
        <div className="mt-1 flex items-end justify-center gap-0.5">
          <span className="text-[52px] font-semibold leading-none tabular-nums">
            {week}
          </span>
          <span className="pb-2 text-sm font-medium leading-none text-muted-foreground">
            {t("cardWeekSuffix")}
          </span>
        </div>
        <div className="mt-1.5 text-mobile-caption pc:text-xs text-muted-foreground tabular-nums">
          {start.format("MM-DD")}–{endIncl.format("MM-DD")}
        </div>
      </div>
    );
  }

  /** 月复盘：自然月（period 在用户时区下展示） */
  if (scope === "monthly" && ps && pe) {
    const monthStart = instantInUserTz(ps, timeZone);
    if (!monthStart) return null;
    const y = monthStart.year();
    const mNum = monthStart.month() + 1;
    const isEn = locale.startsWith("en");

    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg bg-neutral-100/90 text-foreground dark:bg-muted/45">
        <div className="text-mobile-caption pc:text-[11px] font-medium tracking-wide text-muted-foreground">
          {t("cardYearMeta", { year: y })}
        </div>
        {isEn ? (
          <div className="mt-1 max-w-[140px] px-1 text-center text-[26px] font-semibold leading-snug">
            {monthStart.format("MMMM")}
          </div>
        ) : (
          <div className="mt-1 flex items-end justify-center gap-0.5">
            <span className="text-[52px] font-semibold leading-none tabular-nums">
              {mNum}
            </span>
            <span className="pb-2 text-sm font-medium leading-none text-muted-foreground">
              {t("cardMonthSuffix")}
            </span>
          </div>
        )}
        <div className="mt-1.5 text-mobile-caption pc:text-xs text-muted-foreground tabular-nums">
          {monthStart.format("YYYY-MM")}
        </div>
      </div>
    );
  }

  const dateText = resolveReviewDate(scope, session, timeZone);
  if (!dateText) return null;
  const d = dayjs.tz(dateText, timeZone);
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-lg bg-neutral-100/90 text-foreground dark:bg-muted/45">
      <div className="text-mobile-caption pc:text-[11px] font-medium tracking-wide text-muted-foreground">
        {locale.startsWith("en")
          ? d.format("MMM YYYY")
          : `${d.format("YYYY")}年${d.format("MM")}月`}
      </div>
      <div className="mt-1 text-[52px] font-semibold leading-none tabular-nums">
        {d.format("DD")}
      </div>
      <div className="mt-1.5 text-mobile-caption pc:text-xs text-muted-foreground tabular-nums">
        {d.format("YYYY-MM-DD")}
      </div>
    </div>
  );
}

function ReviewScopeRow({
  scope,
  listType,
  sessions,
  loading,
  onSelect,
  timeZone,
}: {
  scope: ReviewScope;
  listType: "day" | "week" | "month";
  sessions: CoachSessionListItem[];
  loading: boolean;
  onSelect: (sid: string) => void;
  timeZone: string;
}) {
  const t = useTranslations("AiCoachPage.reviews");
  const title =
    scope === "daily"
      ? t("daily")
      : scope === "weekly"
        ? t("weekly")
        : t("monthly");

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="compact"
          className="shrink-0 px-2 font-normal text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link href={`/ai-coach/list?type=${listType}`}>{t("viewAll")}</Link>
        </Button>
      </div>
      {loading ? (
        <div className="flex h-[188px] items-center justify-center rounded-md bg-neutral-100 dark:bg-muted/45">
          <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex h-[188px] items-center rounded-md bg-neutral-100 p-2 dark:bg-muted/45 px-3 py-5 text-mobile-caption pc:text-xs text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md bg-neutral-100 p-2 dark:bg-muted/45">
          <div className="group flex min-w-max items-end px-1 py-1">
            {sessions.map((session, index) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelect(session.id)}
                className={cn(
                  "relative h-[178px] w-[146px] shrink-0 cursor-pointer rounded-xl border border-border/60 bg-background px-2.5 py-2.5 text-left",
                  "transition-[border-color,background-color,color,box-shadow] duration-200 ease-out",
                  index > 0 && "-ml-12",
                  "hover:!z-[60] hover:-translate-y-3 hover:rotate-0 hover:bg-accent/50",
                  "group-hover:opacity-80 hover:!opacity-100",
                )}
                style={{
                  /** 顺序保持 7→6→5（接口 updatedAt 降序）；左侧最新的叠在最上层 */
                  zIndex: sessions.length - index,
                  transform: `translateY(${(index % 3) * 2}px) rotate(${(index % 2 === 0 ? -1 : 1) * 1.5}deg)`,
                }}
              >
                <ReviewDeckCardFace
                  scope={scope}
                  session={session}
                  timeZone={timeZone}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function CoachReviewHub({
  onSelectSession,
}: {
  onSelectSession: (sid: string) => void;
}) {
  const t = useTranslations("AiCoachPage.reviews");
  const { data: profile } = useUserProfile();
  const userTimeZone = useMemo(
    () => resolveUserDisplayTimezone(profile?.timezone),
    [profile?.timezone],
  );

  const daily = useQuery({
    queryKey: queryKeys.aiCoach.reviewSessionsHub("daily"),
    queryFn: async () => {
      const page = await fetchCoachSessionsPage(0, 20, "review", "daily");
      return page?.items ?? [];
    },
  });
  const weekly = useQuery({
    queryKey: queryKeys.aiCoach.reviewSessionsHub("weekly"),
    queryFn: async () => {
      const page = await fetchCoachSessionsPage(0, 20, "review", "weekly");
      return page?.items ?? [];
    },
  });
  const monthly = useQuery({
    queryKey: queryKeys.aiCoach.reviewSessionsHub("monthly"),
    queryFn: async () => {
      const page = await fetchCoachSessionsPage(0, 20, "review", "monthly");
      return page?.items ?? [];
    },
  });

  const rows = useMemo(
    () =>
      [
        {
          scope: "daily" as const,
          listType: "day" as const,
          data: daily.data ?? [],
          pending: daily.isPending,
        },
        {
          scope: "weekly" as const,
          listType: "week" as const,
          data: weekly.data ?? [],
          pending: weekly.isPending,
        },
        {
          scope: "monthly" as const,
          listType: "month" as const,
          data: monthly.data ?? [],
          pending: monthly.isPending,
        },
      ] as const,
    [
      daily.data,
      daily.isPending,
      weekly.data,
      weekly.isPending,
      monthly.data,
      monthly.isPending,
    ],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-100 text-muted-foreground dark:bg-muted/45">
          <Sparkles className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold text-foreground">
          {t("title")}
        </h2>
      </div>
      <div className="space-y-4">
        {rows.map((row) => (
          <ReviewScopeRow
            key={row.scope}
            scope={row.scope}
            listType={row.listType}
            sessions={row.data}
            loading={row.pending}
            onSelect={onSelectSession}
            timeZone={userTimeZone}
          />
        ))}
      </div>
    </div>
  );
}
