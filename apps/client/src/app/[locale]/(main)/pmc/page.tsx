"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import type {
  PmcProjectionScope,
  PmcProjectionScenario,
} from "@shared/pmc-projection";
import {
  PMC_PROJECTION_SCOPES,
  PMC_PROJECTION_SCENARIOS,
} from "@shared/pmc-projection";
import { usePmcProjection } from "@/api/pmc-projection";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "@/i18n/navigation";
import { useStore } from "@/lib/store";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useMobileMetricSubpageNavigation } from "@/components/metrics/use-mobile-metric-subpage-navigation";

const ProjectionChart = dynamic(
  () => import("./components/PMCProjectionChart"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[460px] w-full rounded-md" />,
  },
);
const metrics = ["ctl", "atl", "tsb"] as const;

export default function PMCPage() {
  const t = useTranslations("PmcProjection");
  const format = useFormatter();
  const search = useSearchParams();
  const storedScope = useStore((state) => state.pmcFilters.selectedSportType);
  const setScope = useStore((state) => state.setPmcSportType);
  const scope = PMC_PROJECTION_SCOPES.includes(
    storedScope as PmcProjectionScope,
  )
    ? (storedScope as PmcProjectionScope)
    : "ALL";
  // Shared links may preserve a coach-selected scenario; ordinary visits use automatic selection.
  const requested = search?.get("scenario") as PmcProjectionScenario;
  const scenario = PMC_PROJECTION_SCENARIOS.includes(requested)
    ? requested
    : "AUTO";
  const historyDays = search?.get("historyDays") === "90" ? 90 : 60;
  const query = usePmcProjection(scope, scenario, historyDays);
  const result = query.data;
  const number = (value: number | null | undefined) =>
    value == null ? "—" : format.number(value, { maximumFractionDigits: 1 });
  const coachParams = new URLSearchParams({
    pmcQuestion: "1",
    pmcScope: scope,
    pmcScenario: scenario,
    pmcHistory: String(historyDays),
    ...(result ? { pmcProjection: result.projectionId } : {}),
  });
  useSetPageTitle(t("title"));
  useMobileMetricSubpageNavigation({ title: t("title") });

  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-5 md:gap-5"
      data-testid="pmc-projection-page"
    >
      <div
        className="flex items-center justify-between gap-4"
        data-testid="pmc-page-header"
      >
        <h1 className="hidden text-lg font-semibold md:block">{t("title")}</h1>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="w-32" aria-label={t("scopeLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {PMC_PROJECTION_SCOPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`scopes.${value}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button size="sm" asChild>
            <Link href={`/ai-coach?${coachParams}`}>{t("askCoach")}</Link>
          </Button>
        </div>
      </div>
      {query.isPending ? (
        <div className="flex flex-col gap-5" aria-busy="true">
          <Skeleton className="h-24 w-full rounded-md" />
          <Skeleton className="h-[460px] w-full rounded-md" />
        </div>
      ) : null}
      {query.isError && !result ? (
        <section
          className="flex min-h-64 flex-col items-center justify-center gap-4 text-sm text-muted-foreground"
          role="status"
          data-testid="pmc-initial-error"
        >
          <p>{t("failed")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            {t("retry")}
          </Button>
        </section>
      ) : null}
      {result ? (
        <>
          <dl
            className="grid grid-cols-3 gap-2 md:gap-3"
            data-testid="pmc-outlook-summary"
          >
            {metrics.map((metric) => (
              <div
                key={metric}
                className="flex min-w-0 flex-col gap-4 rounded-md bg-muted p-3 md:p-4"
              >
                <dt className="text-xs font-medium text-muted-foreground md:text-sm">
                  {t(`metrics.${metric}`)}
                </dt>
                <dd
                  className="text-2xl font-semibold leading-none tabular-nums md:text-3xl"
                  data-testid={`pmc-current-${metric}`}
                >
                  {number(result.current?.[metric])}
                </dd>
              </div>
            ))}
          </dl>
          {result.history.length ? (
            <ProjectionChart result={result} refreshError={query.isError} />
          ) : (
            <p
              role="status"
              className="py-16 text-center text-sm text-muted-foreground"
            >
              {t("empty")}
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
