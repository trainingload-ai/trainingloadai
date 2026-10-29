"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Database,
  Download,
  FileSearch,
  Loader2,
  Map as MapIcon,
  RotateCcw,
  Search,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { FitRoutePanel } from "./fit-route-panel";
import type { FitFileViewerPageMessages } from "../fit-view-copy";
import {
  fitDisplayUnits,
  formatSemicircleCoordinate,
} from "../fit-value-format";
import type {
  FitFieldDescriptor,
  FitMessage,
  FitMessageGroup,
  FitPageResult,
  FitValue,
  FitViewModel,
} from "../fit-view-model";

const FitRecordChart = dynamic(
  () => import("./fit-record-chart").then((module) => module.FitRecordChart),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-80 animate-pulse rounded-compact border border-neutral-200 bg-neutral-50/60 motion-reduce:animate-none dark:border-border dark:bg-white/[0.025]" />
    ),
  },
);

const MESSAGE_PAGE_SIZE = 100;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDuration(seconds: number | null, unknown: string) {
  if (seconds == null) return unknown;
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatDistance(meters: number | null, unknown: string) {
  if (meters == null) return unknown;
  return meters >= 1000
    ? `${(meters / 1000).toFixed(2)} km`
    : `${Math.round(meters)} m`;
}

function formatDate(value: string | null, lang: string, unknown: string) {
  if (!value) return unknown;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function formatValue(
  value: FitValue | undefined,
  lang: string,
  field?: FitFieldDescriptor,
) {
  if (value == null) return "—";
  if (
    typeof value === "number" &&
    field?.units
      ?.split(" / ")
      .some((unit) => unit.toLocaleLowerCase() === "semicircles")
  ) {
    return formatSemicircleCoordinate(value, lang);
  }
  if (typeof value === "number")
    return new Intl.NumberFormat(lang).format(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat(lang, {
        dateStyle: "short",
        timeStyle: "medium",
      }).format(date);
    }
  }
  return value;
}

function messageLabel(
  group: FitMessageGroup,
  resultsCopy: FitFileViewerPageMessages["results"],
) {
  return group.profileDefined ? group.label : resultsCopy.unprofiledMessage;
}

function fieldLabel(
  field: FitFieldDescriptor,
  resultsCopy: FitFileViewerPageMessages["results"],
) {
  return field.source === "unknown" ? resultsCopy.unprofiledField : field.key;
}

function fieldUnits(field: FitFieldDescriptor) {
  return fitDisplayUnits(field.units, field.type);
}

function idLabel(value: number | null) {
  return value == null ? null : `#${value}`;
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 bg-white px-4 py-4 dark:bg-card sm:px-5">
      <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
        <Icon
          aria-hidden="true"
          className="size-3.5 text-emerald-600 dark:text-emerald-300"
        />
        {label}
      </div>
      <div className="mt-2 truncate text-xl font-black tabular-nums text-neutral-950 dark:text-white">
        {value}
      </div>
      {detail ? (
        <div className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-t border-neutral-200 px-4 py-3 first:border-t-0 dark:border-border sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-baseline sm:gap-4 sm:px-5">
      <dt className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm font-medium text-neutral-900 dark:text-neutral-100 sm:text-right">
        {value}
      </dd>
    </div>
  );
}

function MessageTable({
  result,
  lang,
  noRows,
  caption,
  copy,
}: {
  result: FitPageResult | null;
  lang: string;
  noRows: string;
  caption: string;
  copy: FitFileViewerPageMessages["results"];
}) {
  if (!result || result.rows.length === 0) {
    return (
      <div className="grid min-h-40 place-items-center border-y border-dashed border-neutral-200 px-6 py-10 text-center text-sm text-neutral-500 dark:border-border dark:text-neutral-400">
        {noRows}
      </div>
    );
  }

  return (
    <div className="max-h-[34rem] overflow-auto border-y border-neutral-200 dark:border-border">
      <table className="w-full min-w-max border-collapse text-left text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-20 bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-30 border-b border-r border-neutral-200 bg-neutral-100 px-3 py-2 font-semibold dark:border-border dark:bg-neutral-900"
            >
              #
            </th>
            {result.fields.map((field) => (
              <th
                key={field.key}
                scope="col"
                className="max-w-72 border-b border-r border-neutral-200 px-3 py-2 font-mono font-semibold last:border-r-0 dark:border-border"
              >
                <span className="block">{fieldLabel(field, copy)}</span>
                {field.number != null || field.units ? (
                  <span className="mt-0.5 block whitespace-nowrap text-[10px] font-normal text-neutral-500 dark:text-neutral-400">
                    {[idLabel(field.number), fieldUnits(field)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row: FitMessage, rowIndex) => (
            <tr
              key={`${result.page}-${rowIndex}`}
              className="align-top odd:bg-white even:bg-neutral-50/70 hover:bg-emerald-50/50 dark:odd:bg-card dark:even:bg-white/[0.025] dark:hover:bg-emerald-400/[0.05]"
            >
              <th
                scope="row"
                className="sticky left-0 border-b border-r border-neutral-200 bg-inherit px-3 py-2 font-mono font-normal tabular-nums text-neutral-500 dark:border-border dark:text-neutral-400"
              >
                {(result.page - 1) * result.pageSize + rowIndex + 1}
              </th>
              {result.fields.map((field) => (
                <td
                  key={field.key}
                  className="max-w-80 border-b border-r border-neutral-200 px-3 py-2 font-mono text-neutral-800 last:border-r-0 dark:border-border dark:text-neutral-200"
                >
                  <span className="block max-h-24 overflow-auto whitespace-pre-wrap break-all">
                    {formatValue(row[field.key], lang, field)}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MessageGroupButton({
  group,
  active,
  tabbable,
  onSelect,
  onNavigate,
  lang,
  copy,
  includeUnknownData,
}: {
  group: FitMessageGroup;
  active: boolean;
  tabbable: boolean;
  onSelect: (groupKey: string) => void;
  onNavigate: (
    groupKey: string,
    direction: "next" | "previous" | "first" | "last",
  ) => void;
  lang: string;
  copy: FitFileViewerPageMessages["results"];
  includeUnknownData: boolean;
}) {
  const previewFields = group.fields.filter(
    (field) => includeUnknownData || field.source !== "unknown",
  );
  return (
    <button
      id={`fit-message-group-${group.key}`}
      type="button"
      role="option"
      onClick={() => onSelect(group.key)}
      onKeyDown={(event) => {
        const direction =
          event.key === "ArrowDown"
            ? "next"
            : event.key === "ArrowUp"
              ? "previous"
              : event.key === "Home"
                ? "first"
                : event.key === "End"
                  ? "last"
                  : null;
        if (!direction) return;
        event.preventDefault();
        onNavigate(group.key, direction);
      }}
      aria-selected={active}
      tabIndex={tabbable ? 0 : -1}
      className={cn(
        "w-full border-l-2 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60",
        active
          ? "border-emerald-500 bg-emerald-50 text-neutral-950 dark:bg-emerald-400/[0.08] dark:text-white"
          : "border-transparent text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/[0.04]",
      )}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate font-mono text-xs font-semibold">
            {messageLabel(group, copy)}
          </span>
          {group.messageNumber != null ? (
            <span className="shrink-0 font-mono text-[10px] font-normal text-neutral-400 dark:text-neutral-500">
              {idLabel(group.messageNumber)}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
          {new Intl.NumberFormat(lang).format(group.count)}
        </span>
      </span>
      <span className="mt-1 block truncate font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
        {previewFields
          .slice(0, 5)
          .map((field) =>
            field.source === "unknown" ? idLabel(field.number) : field.key,
          )
          .filter(Boolean)
          .join(" · ")}
      </span>
    </button>
  );
}

function FitMessageBrowser({
  groups,
  lang,
  copy,
  loadRows,
  exportCsv,
  isExporting,
  active,
  profileVersion,
}: {
  groups: FitMessageGroup[];
  lang: string;
  copy: FitFileViewerPageMessages;
  loadRows: (
    groupKey: string,
    query: string,
    page: number,
    pageSize: number,
    includeUnknownData: boolean,
  ) => Promise<FitPageResult>;
  exportCsv: (groupKey: string) => Promise<void>;
  isExporting: boolean;
  active: boolean;
  profileVersion: string;
}) {
  const r = copy.results;
  const standardGroups = useMemo(
    () => groups.filter((group) => group.profileDefined),
    [groups],
  );
  const [includeUnknownData, setIncludeUnknownData] = useState(
    () => standardGroups.length === 0,
  );
  const visibleGroups = includeUnknownData ? groups : standardGroups;
  const [activeGroupKey, setActiveGroupKey] = useState(
    visibleGroups[0]?.key ?? "",
  );
  const [groupQuery, setGroupQuery] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<FitPageResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeGroup =
    visibleGroups.find((group) => group.key === activeGroupKey) ??
    visibleGroups[0];
  const filteredGroups = useMemo(() => {
    const normalized = groupQuery.trim().toLocaleLowerCase();
    if (!normalized) return visibleGroups;
    return visibleGroups.filter((group) => {
      const fields = group.fields
        .filter((field) => includeUnknownData || field.source !== "unknown")
        .map((field) => `${field.key} ${idLabel(field.number) ?? ""}`)
        .join(" ");
      return `${group.key} ${group.label} ${messageLabel(group, r)} ${idLabel(group.messageNumber) ?? ""} ${fields}`
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [groupQuery, includeUnknownData, r, visibleGroups]);

  useEffect(() => {
    if (!active || !activeGroup) return;
    let cancelled = false;
    const timeout = window.setTimeout(
      async () => {
        setIsLoading(true);
        setError(null);
        try {
          const nextResult = await loadRows(
            activeGroup.key,
            query,
            page,
            MESSAGE_PAGE_SIZE,
            includeUnknownData,
          );
          if (!cancelled) setResult(nextResult);
        } catch {
          if (!cancelled) setError(copy.errors.parse);
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      },
      query ? 180 : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    active,
    activeGroup,
    copy.errors.parse,
    includeUnknownData,
    loadRows,
    page,
    query,
  ]);

  if (!activeGroup) return null;

  const selectGroup = (groupKey: string) => {
    setActiveGroupKey(groupKey);
    setQuery("");
    setPage(1);
    setResult(null);
    setError(null);
    setIsLoading(true);
  };
  const toggleUnknownData = () => {
    const nextValue = !includeUnknownData;
    setIncludeUnknownData(nextValue);
    setGroupQuery("");
    if (
      !nextValue &&
      !standardGroups.some((group) => group.key === activeGroupKey)
    ) {
      setActiveGroupKey(standardGroups[0]?.key ?? "");
    }
    setQuery("");
    setPage(1);
    setResult(null);
    setError(null);
    setIsLoading(true);
  };
  const moveGroupFocus = (
    groupKey: string,
    direction: "next" | "previous" | "first" | "last",
  ) => {
    if (filteredGroups.length === 0) return;
    const currentIndex = Math.max(
      0,
      filteredGroups.findIndex((group) => group.key === groupKey),
    );
    const nextIndex =
      direction === "first"
        ? 0
        : direction === "last"
          ? filteredGroups.length - 1
          : direction === "next"
            ? Math.min(filteredGroups.length - 1, currentIndex + 1)
            : Math.max(0, currentIndex - 1);
    const nextGroup = filteredGroups[nextIndex];
    if (!nextGroup) return;
    selectGroup(nextGroup.key);
    window.requestAnimationFrame(() => {
      document.getElementById(`fit-message-group-${nextGroup.key}`)?.focus();
    });
  };
  const activeGroupIsVisible = filteredGroups.some(
    (group) => group.key === activeGroup.key,
  );
  const currentResult =
    result?.group === activeGroup.key &&
    result.query === query &&
    result.page === page
      ? result
      : null;
  const showLoading = isLoading || (!currentResult && !error);
  const pageCount = currentResult
    ? Math.max(1, Math.ceil(currentResult.total / currentResult.pageSize))
    : 1;
  const pageLabel = r.page
    .replace("{page}", new Intl.NumberFormat(lang).format(page))
    .replace("{pages}", new Intl.NumberFormat(lang).format(pageCount));

  return (
    <div className="overflow-hidden rounded-compact border border-neutral-200 bg-white dark:border-border dark:bg-card">
      <div className="flex flex-col gap-2 border-b border-neutral-200 bg-neutral-50/60 px-3 py-2.5 dark:border-border dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            {includeUnknownData ? r.rawView : r.standardView}
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {(includeUnknownData
              ? r.rawViewDetail
              : r.standardViewDetail
            ).replace("{version}", profileVersion)}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={includeUnknownData}
          onClick={toggleUnknownData}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-compact border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:border-border dark:bg-card dark:text-neutral-200 dark:hover:bg-accent sm:h-8"
        >
          {includeUnknownData ? r.hideUnprofiled : r.showUnprofiled}
        </button>
      </div>
      <div className="grid min-h-[36rem] lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-neutral-200 bg-neutral-50/70 dark:border-border dark:bg-white/[0.02] lg:flex lg:min-h-0 lg:flex-col">
          <div className="border-b border-neutral-200 p-3 dark:border-border">
            <label className="relative block">
              <span className="sr-only">{r.messageType}</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
              />
              <input
                type="search"
                name="fit-message-group-search"
                autoComplete="off"
                value={groupQuery}
                onChange={(event) => setGroupQuery(event.target.value)}
                placeholder={r.messageType}
                className="h-9 w-full rounded-compact border border-neutral-300 bg-white pl-9 pr-3 text-sm text-neutral-900 outline-none transition focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-border dark:bg-neutral-950 dark:text-white"
              />
            </label>
          </div>
          <div
            role="listbox"
            aria-label={r.messageType}
            className="min-h-0 flex-1 overflow-y-auto py-1"
          >
            {filteredGroups.length > 0 ? (
              filteredGroups.map((group, index) => (
                <MessageGroupButton
                  key={group.key}
                  group={group}
                  active={group.key === activeGroup.key}
                  tabbable={
                    group.key === activeGroup.key ||
                    (!activeGroupIsVisible && index === 0)
                  }
                  onSelect={selectGroup}
                  onNavigate={moveGroupFocus}
                  lang={lang}
                  copy={r}
                  includeUnknownData={includeUnknownData}
                />
              ))
            ) : (
              <p className="px-4 py-8 text-center text-xs text-neutral-500 dark:text-neutral-400">
                {r.noRows}
              </p>
            )}
          </div>
        </aside>

        <section className="min-w-0">
          <div className="border-b border-neutral-200 p-4 dark:border-border sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0">
                <div className="lg:hidden">
                  <label
                    htmlFor="fit-message-group-select"
                    className="mb-1.5 block text-xs font-semibold text-neutral-500 dark:text-neutral-400"
                  >
                    {r.messageType}
                  </label>
                  <select
                    id="fit-message-group-select"
                    value={activeGroup.key}
                    onChange={(event) => selectGroup(event.target.value)}
                    className="h-11 w-full rounded-compact border border-neutral-300 bg-white px-3 font-mono text-base font-semibold text-neutral-900 outline-none focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-border dark:bg-neutral-950 dark:text-white sm:h-10 sm:text-sm"
                  >
                    {visibleGroups.map((group) => (
                      <option key={group.key} value={group.key}>
                        {messageLabel(group, r)} {idLabel(group.messageNumber)}{" "}
                        · {new Intl.NumberFormat(lang).format(group.count)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="hidden lg:block">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <h3 className="truncate font-mono text-base font-bold text-neutral-950 dark:text-white">
                      {messageLabel(activeGroup, r)}
                    </h3>
                    {activeGroup.messageNumber != null ? (
                      <span className="shrink-0 font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                        {idLabel(activeGroup.messageNumber)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {r.rows.replace(
                      "{count}",
                      new Intl.NumberFormat(lang).format(activeGroup.count),
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isExporting}
                aria-busy={isExporting}
                onClick={() => exportCsv(activeGroup.key)}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-compact border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-50 dark:border-border dark:bg-card dark:text-neutral-200 dark:hover:bg-accent sm:h-8 sm:text-xs"
              >
                {isExporting ? (
                  <Loader2
                    aria-hidden="true"
                    className="size-3.5 animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <Download aria-hidden="true" className="size-3.5" />
                )}
                {copy.buttons.exportCsv}
              </button>
            </div>

            <label className="mt-4 block max-w-xl">
              <span className="mb-1.5 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                {r.search}
              </span>
              <span className="relative block">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
                />
                <input
                  type="search"
                  name={`fit-message-search-${activeGroup.key}`}
                  autoComplete="off"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                    setError(null);
                    setIsLoading(true);
                  }}
                  placeholder={r.searchPlaceholder}
                  className="h-11 w-full rounded-compact border border-neutral-300 bg-white pl-9 pr-3 text-base text-neutral-900 outline-none transition focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:border-border dark:bg-neutral-950 dark:text-white sm:h-10 sm:text-sm"
                />
              </span>
            </label>
          </div>

          {error ? (
            <div
              role="alert"
              className="px-5 py-4 text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </div>
          ) : null}

          {showLoading ? (
            <div className="space-y-2 px-4 py-5" aria-live="polite">
              <span className="sr-only">{copy.buttons.inspecting}</span>
              {Array.from({ length: 8 }, (_, index) => (
                <div
                  key={index}
                  aria-hidden="true"
                  className="h-9 animate-pulse rounded-xs bg-neutral-100 motion-reduce:animate-none dark:bg-white/[0.05]"
                />
              ))}
            </div>
          ) : error ? null : (
            <MessageTable
              result={currentResult}
              lang={lang}
              noRows={r.noRows}
              caption={`${messageLabel(activeGroup, r)} ${idLabel(activeGroup.messageNumber) ?? ""} · ${pageLabel}`}
              copy={r}
            />
          )}

          {currentResult && !showLoading ? (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-neutral-500 dark:text-neutral-400 sm:px-5">
              <span>
                {r.showing
                  .replace(
                    "{shown}",
                    new Intl.NumberFormat(lang).format(
                      currentResult.rows.length,
                    ),
                  )
                  .replace(
                    "{total}",
                    new Intl.NumberFormat(lang).format(currentResult.total),
                  )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => {
                    setError(null);
                    setIsLoading(true);
                    setPage((current) => Math.max(1, current - 1));
                  }}
                  aria-label={r.page
                    .replace("{page}", String(Math.max(1, page - 1)))
                    .replace("{pages}", String(pageCount))}
                  className="grid size-11 place-items-center rounded-compact border border-neutral-300 bg-white text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:pointer-events-none disabled:opacity-40 dark:border-border dark:bg-card dark:text-neutral-200 dark:hover:bg-accent sm:size-9"
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </button>
                <span className="min-w-24 text-center font-mono text-[11px] tabular-nums">
                  {pageLabel}
                </span>
                <button
                  type="button"
                  disabled={page >= pageCount}
                  onClick={() => {
                    setError(null);
                    setIsLoading(true);
                    setPage((current) => Math.min(pageCount, current + 1));
                  }}
                  aria-label={r.page
                    .replace("{page}", String(Math.min(pageCount, page + 1)))
                    .replace("{pages}", String(pageCount))}
                  className="grid size-11 place-items-center rounded-compact border border-neutral-300 bg-white text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:pointer-events-none disabled:opacity-40 dark:border-border dark:bg-card dark:text-neutral-200 dark:hover:bg-accent sm:size-9"
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Overview({
  model,
  lang,
  copy,
}: {
  model: FitViewModel;
  lang: string;
  copy: FitFileViewerPageMessages;
}) {
  const r = copy.results;
  const unknown = r.unknown;
  const sport =
    [model.identity.sport, model.identity.subSport]
      .filter(Boolean)
      .join(" / ") ||
    model.identity.type ||
    unknown;
  const heartRate =
    model.summary.averageHeartRate == null && model.summary.maxHeartRate == null
      ? unknown
      : `${model.summary.averageHeartRate ?? "—"} / ${model.summary.maxHeartRate ?? "—"} bpm`;
  const power =
    model.summary.averagePower == null && model.summary.maxPower == null
      ? unknown
      : `${model.summary.averagePower ?? "—"} / ${model.summary.maxPower ?? "—"} W`;
  const topGroups = model.groups.slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="grid gap-px overflow-hidden rounded-compact border border-neutral-200 bg-neutral-200 dark:border-border dark:bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Activity}
          label={r.sport}
          value={sport}
          detail={model.identity.type ?? undefined}
        />
        <Metric
          icon={Timer}
          label={r.elapsed}
          value={formatDuration(model.summary.elapsedSeconds, unknown)}
          detail={formatDate(model.summary.startedAt, lang, unknown)}
        />
        <Metric
          icon={Activity}
          label={r.distance}
          value={formatDistance(model.summary.distanceMeters, unknown)}
          detail={`${new Intl.NumberFormat(lang).format(model.summary.laps)} ${r.laps}`}
        />
        <Metric
          icon={Database}
          label={r.records}
          value={new Intl.NumberFormat(lang).format(model.summary.records)}
          detail={r.groupCount.replace(
            "{count}",
            new Intl.NumberFormat(lang).format(model.groups.length),
          )}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(17rem,0.75fr)]">
        <section className="overflow-hidden rounded-compact border border-neutral-200 bg-white dark:border-border dark:bg-card">
          <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-4 py-3 dark:border-border sm:px-5">
            <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
              {r.overview}
            </h3>
            <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
              {model.header.signature || unknown}
            </span>
          </div>
          <dl>
            <DetailRow label={r.file} value={model.fileName} />
            <DetailRow label={r.size} value={formatBytes(model.fileSize)} />
            <DetailRow label={r.type} value={model.identity.type ?? unknown} />
            <DetailRow
              label={r.manufacturer}
              value={model.identity.manufacturer ?? unknown}
            />
            <DetailRow
              label={r.product}
              value={model.identity.product ?? unknown}
            />
            <DetailRow
              label={r.created}
              value={formatDate(model.identity.createdAt, lang, unknown)}
            />
            <DetailRow label={r.heartRate} value={heartRate} />
            <DetailRow label={r.power} value={power} />
          </dl>
        </section>

        <section className="rounded-compact border border-neutral-200 bg-white p-4 dark:border-border dark:bg-card sm:p-5">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
              {r.messages}
            </h3>
            <span className="font-mono text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
              {new Intl.NumberFormat(lang).format(
                model.diagnostics.totalMessages,
              )}
            </span>
          </div>
          <div className="mt-4 divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-border dark:border-border">
            {topGroups.map((group) => (
              <div
                key={group.key}
                className="flex items-center justify-between gap-3 py-2.5 text-xs"
              >
                <span className="truncate font-mono font-semibold text-neutral-700 dark:text-neutral-200">
                  {messageLabel(group, r)}
                  {group.messageNumber != null ? (
                    <span className="ml-1.5 font-normal text-neutral-400 dark:text-neutral-500">
                      {idLabel(group.messageNumber)}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                  {new Intl.NumberFormat(lang).format(group.count)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Diagnostics({
  model,
  lang,
  copy,
}: {
  model: FitViewModel;
  lang: string;
  copy: FitFileViewerPageMessages;
}) {
  const r = copy.results;
  const passed = model.diagnostics.integrityPassed;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(17rem,0.7fr)_minmax(0,1.3fr)]">
      <section
        className={cn(
          "rounded-compact border p-5",
          passed
            ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06]"
            : "border-amber-300 bg-amber-50/70 dark:border-amber-400/25 dark:bg-amber-400/[0.06]",
        )}
      >
        <div className="flex items-start gap-3">
          {passed ? (
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-300"
            />
          ) : (
            <CircleAlert
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300"
            />
          )}
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
              {r.integrity}
            </div>
            <h3 className="mt-1 text-xl font-black text-neutral-950 dark:text-white">
              {passed ? r.passed : r.failed}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              {passed ? r.passedDetail : r.failedDetail}
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-compact border border-neutral-200 bg-white dark:border-border dark:bg-card">
        <dl className="grid sm:grid-cols-2">
          {[
            [r.signature, model.header.signature || r.unknown],
            [
              r.protocol,
              `${model.header.protocolVersion} / ${model.header.profileVersion}`,
            ],
            [
              r.definitions,
              new Intl.NumberFormat(lang).format(
                model.diagnostics.definitionCount,
              ),
            ],
            [
              r.developerFields,
              new Intl.NumberFormat(lang).format(
                model.diagnostics.developerFieldCount,
              ),
            ],
            [
              r.sdk,
              `${model.diagnostics.decodedWith} · Profile ${model.diagnostics.sdkProfileVersion}`,
            ],
          ].map(([label, value], index) => (
            <div
              key={label}
              className={cn(
                "border-neutral-200 px-4 py-3 dark:border-border sm:px-5",
                index > 0 && "border-t",
                index === 1 && "sm:border-t-0 sm:border-l",
                index > 1 && index % 2 === 1 && "sm:border-l",
                index === 4 && "sm:col-span-2",
              )}
            >
              <dt className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                {label}
              </dt>
              <dd className="mt-1 break-words font-mono text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-neutral-200 px-4 py-4 dark:border-border sm:px-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
            {model.diagnostics.decoderErrors.length > 0 ? (
              <CircleAlert
                aria-hidden="true"
                className="size-4 text-amber-600"
              />
            ) : (
              <CheckCircle2
                aria-hidden="true"
                className="size-4 text-emerald-600 dark:text-emerald-300"
              />
            )}
            {r.decoderErrors}
          </div>
          {model.diagnostics.decoderErrors.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-200">
              {model.diagnostics.decoderErrors.map((warning, index) => (
                <li key={`${index}-${warning}`} className="break-words">
                  {warning}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {r.noWarnings}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

export function FitResultWorkbench({
  model,
  lang,
  copy,
  isExporting,
  loadRows,
  exportFile,
  onReset,
  error,
}: {
  model: FitViewModel;
  lang: string;
  copy: FitFileViewerPageMessages;
  isExporting: boolean;
  loadRows: (
    groupKey: string,
    query: string,
    page: number,
    pageSize: number,
    includeUnknownData: boolean,
  ) => Promise<FitPageResult>;
  exportFile: (format: "csv" | "json", group?: string) => Promise<void>;
  onReset: () => void;
  error: string | null;
}) {
  const r = copy.results;
  const passed = model.diagnostics.integrityPassed;
  const [activeTab, setActiveTab] = useState("overview");
  const workbenchRef = useRef<HTMLElement>(null);

  useEffect(() => {
    workbenchRef.current?.focus();
  }, []);

  return (
    <article
      ref={workbenchRef}
      tabIndex={-1}
      aria-label={`${copy.title}: ${model.fileName}`}
      className="overflow-hidden rounded-compact border border-neutral-200 bg-white shadow-sm outline-none dark:border-border dark:bg-card"
    >
      <header className="border-b border-neutral-200 bg-neutral-50/70 px-4 py-4 dark:border-border dark:bg-white/[0.025] sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-compact bg-neutral-950 text-white dark:bg-white dark:text-neutral-950">
              <FileSearch aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="max-w-full truncate text-base font-black text-neutral-950 dark:text-white">
                  {model.fileName}
                </h2>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-[11px] font-semibold",
                    passed
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200"
                      : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200",
                  )}
                >
                  {passed ? (
                    <CheckCircle2 aria-hidden="true" className="size-3" />
                  ) : (
                    <CircleAlert aria-hidden="true" className="size-3" />
                  )}
                  {passed ? r.passed : r.failed}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
                {[model.identity.type, formatBytes(model.fileSize)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-compact px-2.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-neutral-400 dark:hover:bg-accent dark:hover:text-neutral-100 sm:h-8 sm:text-xs"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              {copy.buttons.reset}
            </button>
            <button
              type="button"
              disabled={isExporting}
              aria-busy={isExporting}
              onClick={() => exportFile("json")}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-compact bg-neutral-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 sm:h-8 sm:text-xs"
            >
              {isExporting ? (
                <Loader2
                  aria-hidden="true"
                  className="size-3.5 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Download aria-hidden="true" className="size-3.5" />
              )}
              {copy.buttons.exportJson}
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 sm:px-5"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto border-b border-neutral-200 px-4 [scrollbar-width:none] dark:border-border sm:px-5 [&::-webkit-scrollbar]:hidden">
          <TabsList className="flex h-auto w-max min-w-full justify-start rounded-none bg-transparent p-0 text-neutral-500 dark:text-neutral-400">
            <TabsTrigger
              value="overview"
              className="min-h-11 shrink-0 gap-1.5 whitespace-nowrap rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs leading-tight shadow-none data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:gap-2 sm:px-4 sm:py-3 sm:text-sm"
            >
              <Activity aria-hidden="true" className="size-4" />
              {r.overview}
            </TabsTrigger>
            <TabsTrigger
              value="map"
              className="min-h-11 shrink-0 gap-1.5 whitespace-nowrap rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs leading-tight shadow-none data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:gap-2 sm:px-4 sm:py-3 sm:text-sm"
            >
              <MapIcon aria-hidden="true" className="size-4" />
              {r.map}
            </TabsTrigger>
            <TabsTrigger
              value="chart"
              className="min-h-11 shrink-0 gap-1.5 whitespace-nowrap rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs leading-tight shadow-none data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:gap-2 sm:px-4 sm:py-3 sm:text-sm"
            >
              <ChartNoAxesCombined aria-hidden="true" className="size-4" />
              {r.chart}
            </TabsTrigger>
            <TabsTrigger
              value="messages"
              className="min-h-11 shrink-0 gap-1.5 whitespace-nowrap rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs leading-tight shadow-none data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:gap-2 sm:px-4 sm:py-3 sm:text-sm"
            >
              <Database aria-hidden="true" className="size-4" />
              {r.messages}
            </TabsTrigger>
            <TabsTrigger
              value="diagnostics"
              className="min-h-11 shrink-0 gap-1.5 whitespace-nowrap rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs leading-tight shadow-none data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:gap-2 sm:px-4 sm:py-3 sm:text-sm"
            >
              <ShieldCheck aria-hidden="true" className="size-4" />
              {r.diagnostics}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="overview"
          className="m-0 p-4 focus-visible:ring-inset sm:p-5"
        >
          <Overview model={model} lang={lang} copy={copy} />
        </TabsContent>
        <TabsContent
          value="map"
          className="m-0 p-4 focus-visible:ring-inset sm:p-5"
        >
          <FitRoutePanel model={model} lang={lang} copy={copy} />
        </TabsContent>
        <TabsContent
          value="chart"
          className="m-0 p-4 focus-visible:ring-inset sm:p-5"
        >
          <FitRecordChart model={model} copy={copy} />
        </TabsContent>
        <TabsContent
          value="messages"
          forceMount
          className="m-0 p-4 focus-visible:ring-inset data-[state=inactive]:hidden sm:p-5"
        >
          <FitMessageBrowser
            groups={model.groups}
            lang={lang}
            copy={copy}
            loadRows={loadRows}
            exportCsv={(groupKey) => exportFile("csv", groupKey)}
            isExporting={isExporting}
            active={activeTab === "messages"}
            profileVersion={model.diagnostics.sdkProfileVersion}
          />
        </TabsContent>
        <TabsContent
          value="diagnostics"
          className="m-0 p-4 focus-visible:ring-inset sm:p-5"
        >
          <Diagnostics model={model} lang={lang} copy={copy} />
        </TabsContent>
      </Tabs>
    </article>
  );
}
