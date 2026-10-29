"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronRight, GripHorizontal, PlusCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BenchmarkType, type ZoneBenchmark, type ZoneSetting } from "@/api/settings";
import { useUpdateUserZone, useUserZones } from "@/hooks/useUserZones";
import { cn } from "@/lib/utils";
import { MobileGroupedList } from "./MobileGroupedList";
import { MobileSheet } from "./MobileSheet";

type ZoneType = "POWER" | "HEART_RATE" | "PACE";
type Sport = "RUN" | "CYCLING" | "SWIM";
type ZoneRow = ZoneSetting & { id: string };
type Selector = "sport" | "benchmark" | null;

const COLORS = ["#94a3b8", "#10b981", "#eab308", "#f97316", "#ef4444", "#a855f7", "#0f172a"];
const DEFAULT_ROWS: ZoneSetting[] = [
  { color: COLORS[0], name: "Z1", min: 0, max: 55 },
  { color: COLORS[1], name: "Z2", min: 55, max: 75 },
  { color: COLORS[2], name: "Z3", min: 75, max: 90 },
  { color: COLORS[3], name: "Z4", min: 90, max: 105 },
  { color: COLORS[4], name: "Z5", min: 105, max: 120 },
];

const BENCHMARKS: Record<ZoneType, ZoneBenchmark[]> = {
  POWER: [BenchmarkType.FTP, BenchmarkType.CP, BenchmarkType.CUSTOM],
  HEART_RATE: [BenchmarkType.LTHR, BenchmarkType.MHR, BenchmarkType.HRR, BenchmarkType.CUSTOM],
  PACE: [BenchmarkType.CS, BenchmarkType.TP, BenchmarkType.CUSTOM],
};

function defaultBenchmark(type: ZoneType): ZoneBenchmark {
  return type === "POWER" ? BenchmarkType.FTP : type === "HEART_RATE" ? BenchmarkType.LTHR : BenchmarkType.CS;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function withIds(zones: ZoneSetting[] | undefined): ZoneRow[] {
  return (zones?.length ? zones : DEFAULT_ROWS).map((row, index) => ({
    ...row,
    id: newId(),
    color: row.color || COLORS[index % COLORS.length],
    name: row.name || `Z${index + 1}`,
  }));
}

function serialize(benchmark: ZoneBenchmark, rows: ZoneRow[]) {
  return JSON.stringify({ benchmark, rows: rows.map(({ id: _id, ...row }) => row) });
}

function ZoneRowItem({ row, index, description, deleteLabel, onEdit, onDelete, onMove }: { row: ZoneRow; index: number; description: string; deleteLabel: string; onEdit: () => void; onDelete: () => void; onMove: (from: number, to: number) => void }) {
  const [offset, setOffset] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressActive = useRef(false);
  const suppressClick = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  return (
    <div className={cn("relative overflow-hidden border-b border-border/60 last:border-0", dragging && "z-20 overflow-visible")}>
      <button type="button" onClick={onDelete} className="absolute inset-y-0 right-0 w-[76px] bg-red-500 text-mobile-body font-semibold text-white">{deleteLabel}</button>
      <button
        type="button"
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          if (offset === 0) onEdit(); else setOffset(0);
        }}
        onPointerDown={(event) => {
          gesture.current = { x: event.clientX, y: event.clientY };
          longPressActive.current = false;
          clearLongPress();
          longPressTimer.current = setTimeout(() => {
            longPressActive.current = true;
            suppressClick.current = true;
            setDragging(true);
            navigator.vibrate?.(12);
          }, 220);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = gesture.current;
          if (!start) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (longPressActive.current) {
            setDragY(dy);
            return;
          }
          if (Math.abs(dx) > Math.abs(dy) + 4) {
            clearLongPress();
            setOffset(Math.max(-76, Math.min(0, dx)));
          } else if (Math.abs(dy) > 8) {
            clearLongPress();
          }
        }}
        onPointerUp={(event) => {
          clearLongPress();
          const start = gesture.current;
          if (start && longPressActive.current) {
            const target = Math.max(0, Math.min(index + Math.round((event.clientY - start.y) / 58), Number.MAX_SAFE_INTEGER));
            onMove(index, target);
          } else {
            setOffset((value) => value < -34 ? -76 : 0);
          }
          gesture.current = null;
          longPressActive.current = false;
          setDragging(false);
          setDragY(0);
        }}
        onPointerCancel={() => {
          clearLongPress();
          gesture.current = null;
          longPressActive.current = false;
          setDragging(false);
          setDragY(0);
        }}
        style={{ transform: dragging ? `translateY(${dragY}px) scale(1.015)` : `translateX(${offset}px)` }}
        className={cn("relative z-10 flex min-h-[58px] w-full touch-pan-y items-center gap-2 bg-card px-3 text-left transition-transform", dragging && "touch-none rounded-lg shadow-xl")}
      >
        <span className="grid h-10 w-8 shrink-0 place-items-center text-muted-foreground"><GripHorizontal className="size-[18px]" /></span>
        <span className="grid h-9 w-7 shrink-0 place-items-center"><span className="size-[18px] rounded-full" style={{ backgroundColor: row.color }} /></span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-mobile-subtitle font-medium">{row.name || `Z${index + 1}`}</strong>
          <span className="mt-0.5 block truncate text-mobile-caption text-muted-foreground">{description}</span>
        </span>
        <span className="w-[46px] text-right text-mobile-body tabular-nums text-muted-foreground">{row.min}</span>
        <span className="w-[46px] text-right text-mobile-body tabular-nums text-muted-foreground">{row.max}</span>
        <ChevronRight className="size-[13px] text-muted-foreground/45" />
      </button>
    </div>
  );
}

export function MobileZonesPanel() {
  const locale = useLocale();
  const t = useTranslations("ZoneSettings");
  const zonesQuery = useUserZones();
  const update = useUpdateUserZone();
  const [zoneType, setZoneType] = useState<ZoneType>("POWER");
  const [sport, setSport] = useState<Sport>("CYCLING");
  const [benchmark, setBenchmark] = useState<ZoneBenchmark>(BenchmarkType.FTP);
  const [rows, setRows] = useState<ZoneRow[]>(() => withIds(undefined));
  const [loadedSignature, setLoadedSignature] = useState("");
  const [selector, setSelector] = useState<Selector>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ZoneRow | null>(null);
  const zh = locale === "zh" || locale === "zh-hant";
  const labels = {
    benchmarkSection: zh ? "基准" : "Benchmark",
    sport: zh ? "运动类型" : "Sport",
    benchmark: zh ? "基准值" : "Benchmark",
    ranges: zh ? "区间范围" : "Zone ranges",
    order: zh ? "排序" : "Order",
    color: zh ? "颜色" : "Color",
    name: zh ? "名称" : "Name",
    min: zh ? "最小" : "Min",
    max: zh ? "最大" : "Max",
    add: zh ? "添加区间" : "Add zone",
    save: zh ? "保存" : "Save",
    saving: zh ? "保存中…" : "Saving…",
    hint: zh ? "长按排序；向左滑动可删除区间。" : "Long press to reorder; swipe left to delete a zone.",
    custom: zh ? "自定义" : "Custom",
    edit: zh ? "编辑区间" : "Edit zone",
    delete: zh ? "删除区间" : "Delete zone",
    invalid: zh ? "请检查区间名称和最小/最大值。" : "Check the zone name and min/max values.",
    saved: zh ? "区间已保存" : "Zones saved",
  };
  const currentSetting = useMemo(() => zonesQuery.data?.find((item) => item.sportType === sport && item.zoneType === zoneType), [sport, zoneType, zonesQuery.data]);
  const dirty = serialize(benchmark, rows) !== loadedSignature;

  useEffect(() => {
    if (zonesQuery.isLoading) return;
    const nextBenchmark = currentSetting?.benchmark && BENCHMARKS[zoneType].includes(currentSetting.benchmark)
      ? currentSetting.benchmark
      : defaultBenchmark(zoneType);
    const nextRows = withIds(currentSetting?.zones);
    const timer = setTimeout(() => {
      setBenchmark(nextBenchmark);
      setRows(nextRows);
      setLoadedSignature(serialize(nextBenchmark, nextRows));
      setEditingId(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [currentSetting, zoneType, zonesQuery.isLoading]);

  useEffect(() => {
    const row = rows.find((item) => item.id === editingId) ?? null;
    setEditDraft(row ? { ...row } : null);
  }, [editingId, rows]);

  const changeWithGuard = (action: () => void) => {
    if (!dirty || window.confirm(t("unsavedChanges.description"))) action();
  };
  const sportLabel = (value: Sport) => t(`editor.sports.${value.toLowerCase()}`);
  const benchmarkLabel = (value: ZoneBenchmark) => value === BenchmarkType.CUSTOM ? labels.custom : value === BenchmarkType.MHR ? t("benchmark.maxHr") : value === BenchmarkType.HRR ? t("benchmark.hrr") : value;
  const description = zoneType === "POWER" ? t("power") : zoneType === "HEART_RATE" ? t("heartRate") : t("pace");
  const addRow = () => {
    const last = rows.at(-1)?.max ?? rows.length * 10;
    const row: ZoneRow = { id: newId(), name: `Z${rows.length + 1}`, color: COLORS[rows.length % COLORS.length], min: last, max: last + 10 };
    setRows((current) => [...current, row]);
    setEditingId(row.id);
  };
  const saveZones = async () => {
    if (!rows.length || rows.some((row) => !row.name.trim() || !Number.isFinite(row.min) || !Number.isFinite(row.max) || row.min > row.max)) {
      toast.error(labels.invalid);
      return;
    }
    await update.mutateAsync({ sportType: sport, zoneType, benchmark, zones: rows.map(({ id: _id, ...row }) => row) });
    setLoadedSignature(serialize(benchmark, rows));
    toast.success(labels.saved);
  };
  const saveEdit = () => {
    if (!editDraft || !editDraft.name.trim() || editDraft.min > editDraft.max) return;
    setRows((current) => current.map((row) => row.id === editDraft.id ? editDraft : row));
    setEditingId(null);
  };
  const moveRow = (from: number, requestedTo: number) => {
    setRows((current) => {
      const to = Math.max(0, Math.min(requestedTo, current.length - 1));
      if (from === to) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  if (zonesQuery.isLoading) return <div className="mx-4 h-[360px] animate-pulse rounded-surface bg-muted" />;
  if (zonesQuery.isError) return <button type="button" onClick={() => void zonesQuery.refetch()} className="min-h-[260px] w-full px-6 text-red-500">{t("editor.loadError")}</button>;

  return (
    <>
      <div className="space-y-4">
        <div className="grid h-9 grid-cols-3 rounded-lg bg-muted p-0.5 text-mobile-control">
          {(["POWER", "HEART_RATE", "PACE"] as ZoneType[]).map((value) => (
            <button key={value} type="button" onClick={() => changeWithGuard(() => setZoneType(value))} className={cn("rounded-xs", zoneType === value && "bg-background font-medium shadow-sm")}>{value === "POWER" ? t("power") : value === "HEART_RATE" ? t("heartRate") : t("pace")}</button>
          ))}
        </div>

        <section className="space-y-2">
          <h2 className="px-1 text-mobile-caption font-medium text-muted-foreground">{labels.benchmarkSection}</h2>
          <MobileGroupedList>
            <button type="button" onClick={() => setSelector("sport")} className="flex min-h-[50px] w-full items-center border-b border-border/60 px-4 text-left"><span className="flex-1 text-mobile-subtitle">{labels.sport}</span><span className="text-mobile-body text-muted-foreground">{sportLabel(sport)}</span><ChevronRight className="ml-2 size-[13px] text-muted-foreground/45" /></button>
            <button type="button" onClick={() => setSelector("benchmark")} className="flex min-h-[50px] w-full items-center px-4 text-left"><span className="flex-1 text-mobile-subtitle">{labels.benchmark}</span><span className="text-mobile-body text-muted-foreground">{benchmarkLabel(benchmark)}</span><ChevronRight className="ml-2 size-[13px] text-muted-foreground/45" /></button>
          </MobileGroupedList>
        </section>

        <section className="space-y-2">
          <h2 className="px-1 text-mobile-caption font-medium text-muted-foreground">{labels.ranges}</h2>
          <div className="flex items-center gap-2 px-3 text-mobile-caption font-medium text-muted-foreground">
            <span className="w-8 text-center">{labels.order}</span><span className="w-7 text-center">{labels.color}</span><span className="flex-1">{labels.name}</span><span className="w-[46px] text-right">{labels.min}</span><span className="w-[46px] text-right">{labels.max}</span><span className="w-[13px]" />
          </div>
          <MobileGroupedList>
            {rows.map((row, index) => <ZoneRowItem key={row.id} row={row} index={index} description={description} deleteLabel={labels.delete} onEdit={() => setEditingId(row.id)} onDelete={() => setRows((current) => current.filter((item) => item.id !== row.id))} onMove={moveRow} />)}
          </MobileGroupedList>
          <button type="button" onClick={addRow} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control-lg bg-card text-mobile-subtitle font-medium active:bg-muted"><PlusCircle className="size-[18px] text-muted-foreground" />{labels.add}</button>
        </section>

        <p className="px-1 text-mobile-control leading-5 text-muted-foreground">{labels.hint}</p>
        <button type="button" disabled={!dirty || update.isPending} onClick={() => void saveZones()} className="min-h-12 w-full rounded-control-lg bg-zinc-200 text-mobile-subtitle font-semibold text-zinc-800 disabled:opacity-45 dark:bg-zinc-700 dark:text-zinc-100">{update.isPending ? labels.saving : labels.save}</button>
      </div>

      <MobileSheet
        open={selector != null}
        onOpenChange={(open) => { if (!open) setSelector(null); }}
        backgroundVariant="grouped"
        title={selector === "sport" ? labels.sport : labels.benchmark}
      >
        <MobileGroupedList>
          {(selector === "sport" ? (["CYCLING", "RUN", "SWIM"] as Sport[]) : BENCHMARKS[zoneType]).map((value) => {
            const selected = selector === "sport" ? sport === value : benchmark === value;
            return <button key={value} type="button" onClick={() => { if (selector === "sport") changeWithGuard(() => setSport(value as Sport)); else setBenchmark(value as ZoneBenchmark); setSelector(null); }} className="flex min-h-[52px] w-full items-center gap-3 border-b border-border/60 px-4 text-left last:border-0"><span className="flex-1 text-mobile-subtitle">{selector === "sport" ? sportLabel(value as Sport) : benchmarkLabel(value as ZoneBenchmark)}</span>{selected ? <Check className="size-4 text-emerald-600" /> : <span className="size-4" />}</button>;
          })}
        </MobileGroupedList>
      </MobileSheet>

      <MobileSheet
        open={editingId != null}
        onOpenChange={(open) => { if (!open) setEditingId(null); }}
        backgroundVariant="grouped"
        fullScreen
        title={labels.edit}
      >
        {editDraft ? (
          <div className="flex min-h-[calc(96dvh-5rem)] flex-col space-y-4 pb-6">
            <MobileGroupedList>
              <label className="flex min-h-[58px] items-center gap-3 border-b border-border/60 px-4"><span className="w-20 text-mobile-body text-muted-foreground">{labels.name}</span><input value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} className="min-w-0 flex-1 bg-transparent text-mobile-headline outline-none" /></label>
              <label className="flex min-h-[58px] items-center gap-3 border-b border-border/60 px-4"><span className="w-20 text-mobile-body text-muted-foreground">{labels.color}</span><input type="color" value={editDraft.color ?? COLORS[0]} onChange={(event) => setEditDraft({ ...editDraft, color: event.target.value })} className="h-8 w-14 border-0 bg-transparent" /></label>
              <label className="flex min-h-[58px] items-center gap-3 border-b border-border/60 px-4"><span className="w-20 text-mobile-body text-muted-foreground">{labels.min}</span><input type="number" value={editDraft.min} onChange={(event) => setEditDraft({ ...editDraft, min: Number(event.target.value) })} className="min-w-0 flex-1 bg-transparent text-mobile-headline outline-none" /></label>
              <label className="flex min-h-[58px] items-center gap-3 px-4"><span className="w-20 text-mobile-body text-muted-foreground">{labels.max}</span><input type="number" value={editDraft.max} onChange={(event) => setEditDraft({ ...editDraft, max: Number(event.target.value) })} className="min-w-0 flex-1 bg-transparent text-mobile-headline outline-none" /></label>
            </MobileGroupedList>
            <button type="button" onClick={() => { setRows((current) => current.filter((row) => row.id !== editDraft.id)); setEditingId(null); }} className="flex min-h-12 items-center justify-center gap-2 rounded-control-lg bg-red-500/10 text-mobile-subtitle font-medium text-red-500"><Trash2 className="size-[18px]" />{labels.delete}</button>
            <button type="button" onClick={saveEdit} className="mt-auto min-h-12 rounded-control-lg bg-zinc-900 text-mobile-subtitle font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">{labels.save}</button>
          </div>
        ) : null}
      </MobileSheet>
    </>
  );
}
