"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as mapengine from "@deployment/map-engine";
import { decode } from "@mapbox/polyline";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { fetchActivity, type Activity } from "@/api/activities";
import { useActivityLayer } from "@/api/useActivityLayer";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import { useActivityMetricSeries } from "@/api/useActivityMetric";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import { getLocalizedActivityTitle } from "@/lib/activity-title";
import { routeOnlyStyle } from "@/lib/map/map-provider";

function clamp01(v: number) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function colorGreenToRed(t: number) {
  // 绿 -> 黄 -> 红，便于感知速度变化
  const x = clamp01(t);
  const c1 = { r: 16, g: 185, b: 129 }; // emerald-500 #10b981
  const c2 = { r: 250, g: 204, b: 21 }; // yellow-400
  const c3 = { r: 239, g: 68, b: 68 }; // red-500

  if (x <= 0.5) {
    const tt = x / 0.5;
    const r = Math.round(lerp(c1.r, c2.r, tt));
    const g = Math.round(lerp(c1.g, c2.g, tt));
    const b = Math.round(lerp(c1.b, c2.b, tt));
    return `rgb(${r}, ${g}, ${b})`;
  }
  const tt = (x - 0.5) / 0.5;
  const r = Math.round(lerp(c2.r, c3.r, tt));
  const g = Math.round(lerp(c2.g, c3.g, tt));
  const b = Math.round(lerp(c2.b, c3.b, tt));
  return `rgb(${r}, ${g}, ${b})`;
}

function extractSpeedValues(rows: Array<Record<string, unknown>>): number[] {
  // 尽量稳健地从 rows 中抽出 speed 数值（不同后端聚合字段名可能不同）
  const candidates = ["speed", "avg_speed", "averageSpeed", "avgSpeed", "pace"];
  const out: number[] = [];
  for (const r of rows) {
    let v: unknown = undefined;
    for (const k of candidates) {
      if (k in r) {
        v = (r as any)[k];
        break;
      }
    }
    const n = typeof v === "string" ? Number(v) : (v as number);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function formatSpeedOrPace(activity: Activity) {
  // averageSpeed 通常是 m/s
  const speed = activity.averageSpeed;
  if (!speed || !Number.isFinite(speed) || speed <= 0) return "-";

  // RUN 用配速，其他用速度（先按常识处理）
  if (String(activity.sportType || "").toUpperCase() === "RUN") {
    const paceSecPerKm = 1000 / speed;
    return `${formatSecondsToTime(paceSecPerKm, { showHours: false })}/km`;
  }
  const kmh = speed * 3.6;
  return `${kmh.toFixed(1)} km/h`;
}

function MetricItem({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-mobile-caption pc:text-xs text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <div className="text-sm font-semibold text-foreground">{value}</div>
        {unit ? (
          <div className="text-mobile-caption pc:text-xs text-muted-foreground">
            {unit}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function OverlayMetricItem({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="min-w-0 text-center flex flex-col gap-2">
      <div className="truncate text-mobile-caption pc:text-xs leading-4 text-white/75 drop-shadow-sm">
        {label}
      </div>
      <div className="truncate text-xl font-semibold leading-5 text-white drop-shadow-sm">
        {value}
        {unit ? (
          <span className="ml-1 text-mobile-caption pc:text-[11px] text-white/70">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function downloadBlobUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

async function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) reject(new Error("toBlob_failed"));
      else resolve(b);
    }, "image/png");
  });
}

export function ActivitySharePosterModal({
  open,
  onOpenChange,
  activityId,
  theme,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activityId: string | null;
  theme: string | undefined;
}) {
  const t = useTranslations("ActivitySharePoster");
  const tActivityTitle = useTranslations("ActivityTitle");
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const { data: activity, isLoading: isLoadingActivity } = useQuery({
    queryKey: queryKeys.activity.detail(activityId ?? ""),
    queryFn: () => fetchActivity(activityId!),
    enabled: !!activityId && open,
  });

  const { data: activityLayer, isLoading: isLoadingLayer } = useActivityLayer(
    activityId ?? "",
  );

  const { data: speedSeries } = useActivityMetricSeries(
    activityId ?? "",
    "speed",
    !!activityId && open,
  );
  const mapContainerId = useMemo(() => {
    if (!activityId) return "activity-poster-map";
    return `activity-poster-map-${activityId}`;
  }, [activityId]);

  const mapRef = useRef<mapengine.Map | null>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  const generateShareImage = async () => {
    const map = mapRef.current;
    if (!map) return;

    setIsGeneratingShare(true);
    try {
      // 3:4 输出（像手机相册图预览）
      const W = 900;
      const H = 1200;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // map canvas 截图（需要 preserveDrawingBuffer 才稳定）
      const mapCanvas = map.getCanvas();
      const srcW = mapCanvas.width;
      const srcH = mapCanvas.height;
      if (!srcW || !srcH) return;

      // 把 map canvas 中心裁剪到 3:4，再缩放绘制到目标
      const targetRatio = W / H; // 0.75
      const srcRatio = srcW / srcH;
      let cropW = srcW;
      let cropH = srcH;
      if (srcRatio > targetRatio) {
        // 太宽，裁宽
        cropW = Math.round(srcH * targetRatio);
        cropH = srcH;
      } else {
        // 太高，裁高
        cropW = srcW;
        cropH = Math.round(srcW / targetRatio);
      }
      const sx = Math.round((srcW - cropW) / 2);
      const sy = Math.round((srcH - cropH) / 2);

      ctx.drawImage(mapCanvas, sx, sy, cropW, cropH, 0, 0, W, H);

      // 左上角 Logo（来自 /public/LOGO_LIGHT.svg）
      try {
        if (!logoImgRef.current) {
          const resp = await fetch("/LOGO_LIGHT.svg", { cache: "force-cache" });
          if (resp.ok) {
            const blob = await resp.blob();
            const u = URL.createObjectURL(blob);
            const img = new Image();
            img.src = u;
            await img.decode();
            URL.revokeObjectURL(u);
            logoImgRef.current = img;
          }
        }
        if (logoImgRef.current) {
          const padding = 32;
          const logoW = 120;
          const ratio = logoImgRef.current.width
            ? logoImgRef.current.height / logoImgRef.current.width
            : 80 / 468;
          const logoH = Math.round(logoW * ratio);
          ctx.save();
          ctx.globalAlpha = 0.98;
          ctx.drawImage(logoImgRef.current, padding, padding, logoW, logoH);
          ctx.restore();
        }
      } catch {
        // ignore logo failures
      }

      // 指标区域渐变（透明->黑），模拟当前覆盖层
      const grad = ctx.createLinearGradient(0, H * 0.62, 0, H);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.55, "rgba(0,0,0,0.35)");
      grad.addColorStop(1, "rgba(0,0,0,0.80)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);

      // 文案（白字）
      const durationTextLocal =
        activity?.duration != null
          ? formatSecondsToTime(Number(activity.duration), { showHours: true })
          : "-";
      const paceOrSpeed = activity ? formatSpeedOrPace(activity) : "-";
      const elevation =
        activity?.elevationGain != null
          ? `${Math.round(Number(activity.elevationGain))}`
          : "-";
      const cadence =
        activity?.averageCadence != null
          ? `${Math.round(Number(activity.averageCadence))}`
          : "-";
      const hr =
        activity?.avgHeartRate != null
          ? `${Math.round(Number(activity.avgHeartRate))}`
          : "-";
      const power =
        activity?.avgPower != null
          ? `${Math.round(Number(activity.avgPower))}`
          : "-";

      const metrics: Array<{ k: string; v: string; u?: string }> = [
        { k: t("metrics.duration"), v: durationTextLocal },
        { k: t("metrics.paceOrSpeed"), v: paceOrSpeed },
        { k: t("metrics.elevationGain"), v: elevation, u: "m" },
        { k: t("metrics.cadence"), v: cadence, u: "rpm" },
        { k: t("metrics.heartRate"), v: hr, u: "bpm" },
        { k: t("metrics.power"), v: power, u: "W" },
      ];

      const cols = 3;
      const paddingX = 66;
      const bottom = 88;
      const gapX = 24;
      const cellW = (W - paddingX * 2 - gapX * (cols - 1)) / cols;
      const rowH = 92;
      // 指标整体下移（正值向下）
      const metricsYOffset = 100;
      const startY = H - bottom - rowH * 2 - 16 + metricsYOffset;

      // 标题（顶部）
      const header = title || t("activityFallback");
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font =
        "700 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText(header, W / 2, 64);

      for (let i = 0; i < metrics.length; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = paddingX + c * (cellW + gapX) + cellW / 2;
        const y = startY + r * rowH;

        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font =
          "600 18px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
        ctx.fillText(metrics[i]!.k, x, y);

        const unit = metrics[i]!.u;
        const value = metrics[i]!.v + (unit ? ` ${unit}` : "");
        ctx.fillStyle = "rgba(255,255,255,0.98)";
        ctx.font =
          "800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
        ctx.fillText(value, x, y + 44);
      }

      const blob = await blobFromCanvas(canvas);
      const url = URL.createObjectURL(blob);
      const safeId = activityId ?? "share";
      downloadBlobUrl(url, `activity-${safeId}.png`);
      URL.revokeObjectURL(url);
    } finally {
      setIsGeneratingShare(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (!activityLayer?.maps?.length) return;
    const el = document.getElementById(mapContainerId);
    if (!el) return;

    // 初始化一次
    if (!mapRef.current) {
      mapengine.configureMapEngine();
      mapRef.current = new mapengine.Map({
        container: mapContainerId,
        // 弹窗里固定用暗色底图，保证白字悬浮信息可读
        style: routeOnlyStyle("dark"),
        center: [0, 0],
        zoom: 2,
        interactive: false,
        attributionControl: false,
        // 允许把 WebGL canvas 导出成图片（否则分享生成会失败/黑图）
        ...mapengine.getMapCanvasExportOptions(),
      });
    } else {
      // 主题切换时换 style
      mapRef.current.setStyle(routeOnlyStyle("dark"));
    }

    const map = mapRef.current;
    const onLoad = () => {
      const track = activityLayer.maps[0];
      const coords = decode(track.polyline).map(([lat, lng]) => [lng, lat]);
      if (coords.length < 2) return;

      if (map.getLayer("poster-track")) map.removeLayer("poster-track");
      if (map.getSource("poster-track")) map.removeSource("poster-track");

      // 速度 min/max（优先用时序数据，没有就退化成常量色）
      const speedValues = extractSpeedValues(
        (speedSeries?.rows ?? []) as Array<Record<string, unknown>>,
      );
      const minSpeed =
        speedValues.length > 0 ? Math.min(...speedValues) : undefined;
      const maxSpeed =
        speedValues.length > 0 ? Math.max(...speedValues) : undefined;

      // 把速度序列粗略映射到轨迹进度，生成 line-gradient stops
      // 注意：这里不做时间/距离精确对齐（后续可用 distance/time 字段精对齐）
      const stops: Array<number | string> = [];
      if (
        minSpeed != null &&
        maxSpeed != null &&
        Number.isFinite(minSpeed) &&
        Number.isFinite(maxSpeed) &&
        maxSpeed > minSpeed &&
        speedValues.length >= 2
      ) {
        const N = Math.min(24, speedValues.length);
        for (let i = 0; i < N; i++) {
          const idx = Math.round((i * (speedValues.length - 1)) / (N - 1));
          const s = speedValues[idx]!;
          const t = clamp01((s - minSpeed) / (maxSpeed - minSpeed));
          const p = i / (N - 1);
          stops.push(p, colorGreenToRed(t));
        }
      }

      map.addSource("poster-track", {
        type: "geojson",
        lineMetrics: true,
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: coords,
              },
            },
          ],
        },
      });
      map.addLayer({
        id: "poster-track",
        type: "line",
        source: "poster-track",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-width": 6,
          "line-opacity": 0.95,
          // 始终给一个基础色，避免 line-gradient 未生效时落到默认灰色
          "line-color": "rgb(34, 197, 94)",
          ...(stops.length >= 4
            ? {
                "line-gradient": [
                  "interpolate",
                  ["linear"],
                  ["line-progress"],
                  ...stops,
                ],
              }
            : null),
        },
      });

      const bounds = coords.reduce(
        (b, c) => b.extend(c as [number, number]),
        new mapengine.LngLatBounds(
          coords[0] as [number, number],
          coords[0] as [number, number],
        ),
      );
      // 根据轨迹线自适配视图；底部有悬浮指标，增加 bottom padding 避免轨迹被挡住
      map.fitBounds(bounds, {
        padding: { top: 24, left: 24, right: 24, bottom: 140 },
        duration: 0,
        maxZoom: 14,
      });
      map.resize();
    };

    if (map.isStyleLoaded()) {
      onLoad();
    } else {
      map.once("load", onLoad);
    }

    return () => {
      // 不销毁实例，避免重复创建导致闪烁；关闭时留着，下次打开更快
    };
  }, [open, activityLayer?.maps, mapContainerId, theme, speedSeries?.rows]);

  const title = useMemo(() => {
    if (!activity) return t("titleFallback");
    const sport = activity.sportType
      ? String(activity.sportType)
      : t("activityFallback");
    const date = activity.startTime
      ? dayjs(activity.startTime).format("YYYY-MM-DD")
      : "";
    return `${sport}${date ? ` · ${date}` : ""}`;
  }, [activity, t]);

  const durationText = activity?.duration
    ? formatSecondsToTime(Number(activity.duration), { showHours: true })
    : "-";

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent
        side="bottom"
        className={cn(
          "min-h-[60dvh] max-h-[85dvh] overflow-hidden p-0",
          // 桌面尽量用可用宽度，减少两侧留白；同时给一个安全边距
          "lg:w-[min(900px,calc(100vw-2rem))] lg:max-w-none",
        )}
      >
        <div className="flex h-full flex-col bg-background">
          {/* Header */}
          <div className="border-b border-border p-2">
            <div className="flex items-start justify-between gap-3">
              <ResponsiveModalHeader className="space-y-1 text-left">
                <ResponsiveModalTitle className="text-foreground">
                  {title}
                </ResponsiveModalTitle>
                <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                  {isLoadingActivity
                    ? t("loading.activity")
                    : getLocalizedActivityTitle(activity, tActivityTitle, " ")}
                </div>
              </ResponsiveModalHeader>

              {/* 移动端：左上/右上都行，这里放右上 */}
              <div className="lg:hidden">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void generateShareImage();
                  }}
                  disabled={isGeneratingShare}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  {isGeneratingShare
                    ? t("actions.generating")
                    : t("actions.share")}
                </Button>
              </div>
            </div>
          </div>

          {/* Body（可滚动，避免把 footer 挤出屏幕） */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Map */}
            <div className="mx-auto w-full">
              <div className="relative overflow-hidden">
                {/* 正方形地图容器（受 max-w 约束，避免过大遮挡按钮） */}
                <div className="relative h-[500px] w-full overflow-hidden rounded-md bg-muted">
                  <div id={mapContainerId} className="absolute inset-0" />

                  {/* 指标悬浮层：无背景、白字半透明 */}
                  <div className="pointer-events-none absolute inset-x-3 bottom-3">
                    {/* 指标区域渐变：上透明 → 下黑，增强可读性（只作用于底部指标区域） */}
                    <div className="absolute inset-x-0 -bottom-4 h-36 bg-linear-to-b from-transparent via-black/35 to-black/80" />
                    <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                      <OverlayMetricItem
                        label={t("metrics.duration")}
                        value={durationText}
                      />
                      <OverlayMetricItem
                        label={t("metrics.paceOrSpeed")}
                        value={activity ? formatSpeedOrPace(activity) : "-"}
                      />
                      <OverlayMetricItem
                        label={t("metrics.elevationGain")}
                        value={
                          activity?.elevationGain != null
                            ? String(Math.round(Number(activity.elevationGain)))
                            : "-"
                        }
                        unit="m"
                      />
                      <OverlayMetricItem
                        label={t("metrics.cadence")}
                        value={
                          activity?.averageCadence != null
                            ? String(
                                Math.round(Number(activity.averageCadence)),
                              )
                            : "-"
                        }
                        unit="rpm"
                      />
                      <OverlayMetricItem
                        label={t("metrics.heartRate")}
                        value={
                          activity?.avgHeartRate != null
                            ? String(Math.round(Number(activity.avgHeartRate)))
                            : "-"
                        }
                        unit="bpm"
                      />
                      <OverlayMetricItem
                        label={t("metrics.power")}
                        value={
                          activity?.avgPower != null
                            ? String(Math.round(Number(activity.avgPower)))
                            : "-"
                        }
                        unit="W"
                      />
                    </div>
                  </div>
                </div>
              </div>
              {isLoadingLayer ? (
                <div className="mt-2 text-mobile-caption pc:text-xs text-muted-foreground">
                  {t("loading.map")}
                </div>
              ) : null}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border bg-background p-2">
            <div className="hidden items-center justify-end gap-2 lg:flex">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                {t("actions.cancel")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  void generateShareImage();
                }}
                disabled={isGeneratingShare}
              >
                {isGeneratingShare
                  ? t("actions.generating")
                  : t("actions.share")}
              </Button>
              <Button
                onClick={() => {
                  if (!activityId) return;
                  window.open(
                    `/activities/${activityId}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                  onOpenChange(false);
                }}
              >
                {t("actions.view")}
              </Button>
            </div>

            <div className="lg:hidden">
              <Button
                size="xl"
                className="w-full"
                onClick={() => {
                  if (!activityId) return;
                  window.open(
                    `/activities/${activityId}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                  onOpenChange(false);
                }}
              >
                {t("actions.view")}
              </Button>
            </div>
          </div>
        </div>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
