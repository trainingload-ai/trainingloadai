"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Time } from "@/components/DateSelector/types";
import { SportType } from "@/lib/store";
import { usePowerDurationCurve } from "@/api/use-power";
import { useUserBasicInfo } from "@/hooks/useUserProfile";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SportType as ApiSportType } from "@/api/activities";
import { useRouter } from "@/i18n/routing";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DurationKey,
  ProfileType,
  PROFILE_TYPE_INFO,
  usePolylineFromRefs,
  useResolvedChartColor,
} from "./utils";
import { PowerProfileSkeleton } from "./PowerProfileSkeleton";
import {
  FEMALE_POWER_PROFILE_DEMO,
  FEMALE_POWER_PROFILE_GRID,
  MALE_POWER_PROFILE_DEMO,
  MALE_POWER_PROFILE_GRID,
  POWER_PROFILE_DURATION_ORDER,
  classifyPowerProfile,
  findPowerProfileCellPositionAndRatio,
} from "./power-profile-model";

const MIN_SKELETON_MS = 350;
const SKELETON_FADE_MS = 300;

function ProfileTable({
  title,
  grid,
  userWkg,
}: {
  title: string;
  grid: Array<Record<DurationKey, number>>;
  userWkg: Partial<Record<DurationKey, number>> | null;
}) {
  const t = useTranslations("PowerProfile");
  const chartColor = useResolvedChartColor("--chart-1");
  const isMobile = useIsMobile();
  const rowLabels = useMemo(
    () => [
      t("levels.worldClass"),
      t("levels.exceptional"),
      t("levels.excellent"),
      t("levels.veryGood"),
      t("levels.good"),
      t("levels.moderate"),
      t("levels.fair"),
      t("levels.novice"),
      t("levels.untrained"),
    ],
    [t],
  );

  const highlight: Record<
    DurationKey,
    { rowIndex: number | null; ratio: number }
  > = {
    "5s": findPowerProfileCellPositionAndRatio(
      grid,
      userWkg?.["5s"] ?? NaN,
      "5s",
    ),
    "1m": findPowerProfileCellPositionAndRatio(
      grid,
      userWkg?.["1m"] ?? NaN,
      "1m",
    ),
    "5m": findPowerProfileCellPositionAndRatio(
      grid,
      userWkg?.["5m"] ?? NaN,
      "5m",
    ),
    FTP: findPowerProfileCellPositionAndRatio(
      grid,
      userWkg?.["FTP"] ?? NaN,
      "FTP",
    ),
  };

  const { wrapperRef, registerRef, polylinePoints } =
    usePolylineFromRefs<DurationKey>({
      keys: POWER_PROFILE_DURATION_ORDER,
      watchToken: userWkg,
    });

  return (
    <div className="overflow-hidden rounded-surface bg-neutral-100 p-2 dark:bg-muted/45 pc:bg-transparent pc:p-0">
      <div className="px-3 py-2 text-sm font-medium">{title}</div>
      <div ref={wrapperRef} className="relative">
        {polylinePoints ? (
          <svg
            className="absolute inset-0 pointer-events-none z-10"
            width="100%"
            height="100%"
          >
            <polyline
              points={polylinePoints}
              fill="none"
              stroke={chartColor}
              strokeOpacity="0.9"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        ) : null}
        <div className={isMobile ? "overflow-hidden" : "overflow-x-auto"}>
          {isMobile ? (
            <table className="w-full table-fixed border-separate border-spacing-y-1 caption-bottom text-sm">
              <TableHeader className="[&_tr]:border-b-0">
                <TableRow>
                  <TableHead className="w-24 px-1 text-mobile-caption pc:text-[11px] text-muted-foreground">
                    {t("table.level")}
                  </TableHead>
                  <TableHead className="px-1 text-mobile-caption pc:text-[11px] text-center text-muted-foreground">
                    5s
                  </TableHead>
                  <TableHead className="px-1 text-mobile-caption pc:text-[11px] text-center text-muted-foreground">
                    1m
                  </TableHead>
                  <TableHead className="px-1 text-mobile-caption pc:text-[11px] text-center text-muted-foreground">
                    5m
                  </TableHead>
                  <TableHead className="px-1 text-mobile-caption pc:text-[11px] text-center text-muted-foreground">
                    FTP
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grid.map((row, i) => (
                  <TableRow key={i} className="border-b-0">
                    <TableCell className="px-1 py-2 text-mobile-caption pc:text-[11px] leading-tight whitespace-normal">
                      <span className="line-clamp-2">{rowLabels[i]}</span>
                    </TableCell>
                    {(["5s", "1m", "5m", "FTP"] as DurationKey[]).map((k) => {
                      const h = highlight[k];
                      const active =
                        h.rowIndex === i && Number.isFinite(h.ratio);
                      const value = userWkg?.[k];
                      const posPct = Math.max(
                        4,
                        Math.min(96, (h.ratio || 0) * 100),
                      );
                      return (
                        <TableCell key={k} className="relative px-1 py-2">
                          <div className="text-center text-mobile-caption pc:text-[11px] text-muted-foreground">
                            {row[k].toFixed(2)}
                          </div>
                          {active && Number.isFinite(value as number) ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="absolute left-1/2 -translate-x-1/2 z-20"
                                  style={{ bottom: `calc(${posPct}% - 6px)` }}
                                  ref={registerRef(k)}
                                >
                                  <span
                                    className="block rounded-full"
                                    style={{
                                      width: 10,
                                      height: 10,
                                      backgroundColor: chartColor,
                                    }}
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <span className="whitespace-nowrap">
                                  {k}: {(value as number).toFixed(2)} W/kg
                                </span>
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </table>
          ) : (
            <Table className="min-w-[520px] border-separate border-spacing-y-2">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44 text-mobile-caption pc:text-xs text-muted-foreground">
                    {t("table.level")}
                  </TableHead>
                  <TableHead className="text-mobile-caption pc:text-xs text-center text-muted-foreground">
                    5s
                  </TableHead>
                  <TableHead className="text-mobile-caption pc:text-xs text-center text-muted-foreground">
                    1m
                  </TableHead>
                  <TableHead className="text-mobile-caption pc:text-xs text-center text-muted-foreground">
                    5m
                  </TableHead>
                  <TableHead className="text-mobile-caption pc:text-xs text-center text-muted-foreground">
                    FTP
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grid.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-mobile-caption pc:text-xs">
                      {rowLabels[i]}
                    </TableCell>
                    {(["5s", "1m", "5m", "FTP"] as DurationKey[]).map((k) => {
                      const h = highlight[k];
                      const active =
                        h.rowIndex === i && Number.isFinite(h.ratio);
                      const value = userWkg?.[k];
                      const posPct = Math.max(
                        4,
                        Math.min(96, (h.ratio || 0) * 100),
                      );
                      return (
                        <TableCell key={k} className="relative py-3">
                          <div className="text-center text-mobile-caption pc:text-xs text-muted-foreground mb-2">
                            {row[k].toFixed(2)}
                          </div>
                          {active && Number.isFinite(value as number) ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="absolute left-1/2 -translate-x-1/2 z-20"
                                  style={{ bottom: `calc(${posPct}% - 6px)` }}
                                  ref={registerRef(k)}
                                >
                                  <span
                                    className="block rounded-full"
                                    style={{
                                      width: 12,
                                      height: 12,
                                      backgroundColor: chartColor,
                                    }}
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <span className="whitespace-nowrap">
                                  {k}: {(value as number).toFixed(2)} W/kg
                                </span>
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}

export function PowerProfile({
  times = [],
  sportType = "all",
}: {
  times?: Time[];
  sportType?: "all" | SportType;
}) {
  const router = useRouter();
  const t = useTranslations("PowerProfile");
  const isMobile = useIsMobile();
  const { data, isLoading } = usePowerDurationCurve(
    times,
    sportType as SportType,
  );
  const sportForProfile: ApiSportType | undefined =
    (sportType as SportType) === "all"
      ? undefined
      : (sportType as unknown as ApiSportType);
  const {
    gender,
    weight,
    ftp,
    isLoading: UserLoading,
  } = useUserBasicInfo(sportForProfile);

  const userWkg: Partial<Record<DurationKey, number>> | null = useMemo(() => {
    if (!weight || weight <= 0) return null;
    const first = data?.[0];
    if (!first && !ftp) return null;
    const fiveS = first?.["5s"];
    const oneM = first?.["1m"];
    const fiveM = first?.["5m"];
    const f = ftp ?? undefined;
    const res: Partial<Record<DurationKey, number>> = {};
    if (Number.isFinite(fiveS)) res["5s"] = (fiveS as number) / weight;
    if (Number.isFinite(oneM)) res["1m"] = (oneM as number) / weight;
    if (Number.isFinite(fiveM)) res["5m"] = (fiveM as number) / weight;
    if (Number.isFinite(f as number)) res["FTP"] = (f as number) / weight;
    return Object.keys(res).length > 0 ? res : null;
  }, [data, weight, ftp]);

  const isDemo = userWkg == null;
  const isFemale = gender === "female";
  const missingReason = useMemo(() => {
    if (!isDemo) return null;
    if (!weight || weight <= 0) {
      return "missingWeight" as const;
    }
    if ((!data || data.length === 0) && !ftp) {
      return "missingPowerData" as const;
    }
    return "missingData" as const;
  }, [data, ftp, isDemo, weight]);

  const missingOverlay = missingReason ? (
    <div className="absolute inset-0 z-40 flex items-center justify-center rounded-md bg-background/70 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-md border bg-background/95 px-4 py-3">
        <div className="text-sm font-medium">{t("missing.title")}</div>
        <div className="mt-1 text-mobile-caption pc:text-xs text-muted-foreground">
          {missingReason === "missingWeight"
            ? t("missing.missingWeight")
            : missingReason === "missingPowerData"
              ? t("missing.missingPowerData")
              : t("missing.missingData")}
        </div>
        <div className="mt-3 flex justify-center">
          <Button size="sm" onClick={() => router.push("/account")}>
            {t("missing.action")}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  const effectiveValues = useMemo<Record<DurationKey, number>>(() => {
    const baseValues = isFemale
      ? FEMALE_POWER_PROFILE_DEMO
      : MALE_POWER_PROFILE_DEMO;
    return {
      "5s": userWkg?.["5s"] ?? baseValues["5s"] ?? 0,
      "1m": userWkg?.["1m"] ?? baseValues["1m"] ?? 0,
      "5m": userWkg?.["5m"] ?? baseValues["5m"] ?? 0,
      FTP: userWkg?.["FTP"] ?? baseValues["FTP"] ?? 0,
    };
  }, [isFemale, userWkg]);

  const profile = useMemo(() => {
    if (isDemo) {
      return {
        type: null as null | ProfileType,
      };
    }
    return classifyPowerProfile({
      grid: isFemale ? FEMALE_POWER_PROFILE_GRID : MALE_POWER_PROFILE_GRID,
      values: effectiveValues,
    });
  }, [effectiveValues, isDemo, isFemale]);

  const profileInfo = profile.type ? PROFILE_TYPE_INFO[profile.type] : null;
  const isPageLoading = isLoading || UserLoading;

  const [renderContent, setRenderContent] = useState(() => !isPageLoading);
  const [skeletonState, setSkeletonState] = useState<
    "hidden" | "visible" | "fading"
  >(() => (isPageLoading ? "visible" : "hidden"));
  const loadingStartedAtRef = useRef<number>(isPageLoading ? Date.now() : 0);
  const prevLoadingRef = useRef(isPageLoading);
  const showContentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const hideSkeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    const clearTimers = () => {
      if (showContentTimerRef.current) {
        clearTimeout(showContentTimerRef.current);
        showContentTimerRef.current = null;
      }
      if (hideSkeletonTimerRef.current) {
        clearTimeout(hideSkeletonTimerRef.current);
        hideSkeletonTimerRef.current = null;
      }
    };

    if (isPageLoading) {
      clearTimers();
      loadingStartedAtRef.current = Date.now();
      setSkeletonState("visible");
      if (!renderContent) setRenderContent(false);
      prevLoadingRef.current = true;
      return;
    }

    if (prevLoadingRef.current) {
      clearTimers();
      const elapsed = Date.now() - loadingStartedAtRef.current;
      const wait = Math.max(0, MIN_SKELETON_MS - elapsed);
      showContentTimerRef.current = setTimeout(() => {
        setRenderContent(true);
        setSkeletonState("fading");
        hideSkeletonTimerRef.current = setTimeout(() => {
          setSkeletonState("hidden");
        }, SKELETON_FADE_MS);
      }, wait);
      prevLoadingRef.current = false;
    } else {
      setRenderContent(true);
      setSkeletonState("hidden");
    }

    return () => clearTimers();
  }, [isPageLoading, renderContent]);

  if (isMobile && !isPageLoading && missingReason) {
    return (
      <div className="space-y-3">
        <div className="rounded-surface bg-neutral-100 p-4 dark:bg-muted/45">
          <div className="text-sm font-medium">{t("missing.title")}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {missingReason === "missingWeight"
              ? t("missing.missingWeight")
              : missingReason === "missingPowerData"
                ? t("missing.missingPowerData")
                : t("missing.missingData")}
          </div>
        </div>
        <Button
          size="touch"
          className="w-full"
          onClick={() => router.push("/account")}
        >
          {t("missing.action")}
        </Button>
      </div>
    );
  }

  const content = (
    <>
      {userWkg ? (
        <div className="mb-3 grid grid-cols-2 gap-2 md:hidden">
          {POWER_PROFILE_DURATION_ORDER.map((key) => (
            <div
              key={key}
              className="rounded-surface bg-neutral-100 p-3 dark:bg-muted/45"
            >
              <div className="text-xs text-muted-foreground">{key}</div>
              <div className="mt-1 text-base font-semibold tabular-nums">
                {typeof userWkg[key] === "number"
                  ? `${userWkg[key]!.toFixed(2)} W/kg`
                  : "--"}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {gender === "male" && (
        <div className="grid grid-cols-1 gap-4">
          <div className="relative">
            <ProfileTable
              title={t("table.male")}
              grid={MALE_POWER_PROFILE_GRID}
              userWkg={userWkg ?? MALE_POWER_PROFILE_DEMO}
            />
            {!isMobile ? missingOverlay : null}
          </div>
        </div>
      )}
      {gender === "female" && (
        <div className="grid grid-cols-1 gap-4">
          <div className="relative">
            <ProfileTable
              title={t("table.female")}
              grid={FEMALE_POWER_PROFILE_GRID}
              userWkg={userWkg ?? FEMALE_POWER_PROFILE_DEMO}
            />
            {!isMobile ? missingOverlay : null}
          </div>
        </div>
      )}
      {!gender && (
        <div className="grid grid-cols-1 gap-4">
          <div className="relative">
            <ProfileTable
              title={t("table.male")}
              grid={MALE_POWER_PROFILE_GRID}
              userWkg={userWkg ?? MALE_POWER_PROFILE_DEMO}
            />
            {!isMobile ? missingOverlay : null}
          </div>
        </div>
      )}
      <div className="mt-4 rounded-surface bg-neutral-100 px-3 py-3 dark:bg-muted/45 pc:py-2">
        <div className="text-sm font-medium">{t("interpretation.title")}</div>
        {missingReason ? (
          <div className="text-mobile-caption pc:text-xs text-muted-foreground mt-1">
            {t("interpretation.noDataHint")}
          </div>
        ) : null}
        <div className="text-sm mt-2">
          {t("interpretation.type")}：
          {profile.type && profileInfo
            ? `${profile.type} · ${t(`types.${profileInfo.key}.label`)}`
            : t("interpretation.unknown")}
        </div>
        {profile.type && profileInfo ? (
          <div className="mt-2 space-y-1 text-mobile-caption pc:text-xs text-muted-foreground">
            <div>
              {t("interpretation.text")}：
              {t(`types.${profileInfo.key}.interpretation`)}
            </div>
            <div>
              {t("interpretation.reference")}：
              <a
                className="underline underline-offset-2"
                href="https://www.trainingpeaks.com/blog/power-profiling/"
                target="_blank"
                rel="noreferrer"
              >
                {t("interpretation.referenceTitle")}
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="relative">
      {renderContent ? content : null}
      {skeletonState !== "hidden" ? (
        <div
          className={
            renderContent
              ? `absolute inset-0 z-50 bg-background transition-opacity duration-300 ${
                  skeletonState === "fading" ? "opacity-0" : "opacity-100"
                }`
              : `transition-opacity duration-300 ${
                  skeletonState === "fading" ? "opacity-0" : "opacity-100"
                }`
          }
        >
          <PowerProfileSkeleton />
        </div>
      ) : null}
    </div>
  );
}
