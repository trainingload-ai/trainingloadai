"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";

export type MobileMeTrendChartPoint = {
  key: string;
  label: string;
  value: number;
};

const HEIGHT = 142;
const PADDING = { top: 36, right: 8, bottom: 26, left: 10 } as const;

function formatValue(value: number, precision: number) {
  if (!Number.isFinite(value)) return "--";
  if (Math.abs(value) >= 100) return String(Math.round(value));
  return precision > 0 ? value.toFixed(precision) : String(Math.round(value));
}

function tickIndexes(length: number) {
  if (length <= 7) return Array.from({ length }, (_, index) => index);
  const indexes = new Set<number>();
  for (let index = 0; index < 5; index += 1) {
    indexes.add(Math.round((index / 4) * (length - 1)));
  }
  return [...indexes].sort((a, b) => a - b);
}

function chartDomain(values: number[]) {
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = rawMax - rawMin;
  const range = rawRange || Math.max(1, Math.abs(rawMax) * 0.1);
  const paddedMin =
    rawMin >= 0 && rawMin - range * 0.16 < range * 0.25
      ? 0
      : rawMin - range * 0.16;
  const min = Math.max(0, paddedMin);
  const max = rawRange === 0 ? rawMax + 1 : rawMax + range * 0.18;
  return { min, max: max <= min ? min + 1 : max };
}

export function MobileMeTrendChart({
  data,
  ariaLabel,
  locale,
  maximumFractionDigits,
  color = "#10b981",
}: {
  data: MobileMeTrendChartPoint[];
  valueLabel: string;
  ariaLabel: string;
  locale: string;
  maximumFractionDigits: number;
  color?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const cleanData = useMemo(
    () => data.filter((point) => Number.isFinite(point.value)).slice(-30),
    [data],
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const measure = () => setWidth(node.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    if (width <= 0 || cleanData.length < 2) return null;
    const domain = chartDomain(cleanData.map((point) => point.value));
    const plotWidth = Math.max(1, width - PADDING.left - PADDING.right);
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const points = cleanData.map((point, index) => ({
      ...point,
      x:
        PADDING.left +
        (index / Math.max(1, cleanData.length - 1)) * plotWidth,
      y:
        PADDING.top +
        ((domain.max - point.value) / Math.max(1, domain.max - domain.min)) *
          plotHeight,
    }));
    const yTicks = Array.from({ length: 4 }, (_, index) => {
      const ratio = index / 3;
      return {
        y: PADDING.top + ratio * plotHeight,
        value: domain.max - ratio * (domain.max - domain.min),
      };
    });
    return { points, plotHeight, plotWidth, yTicks };
  }, [cleanData, width]);

  if (cleanData.length < 2) {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        className="grid h-[142px] place-items-center text-mobile-control text-muted-foreground"
      >
        --
      </div>
    );
  }

  const resolvedIndex = Math.max(
    0,
    Math.min(cleanData.length - 1, selectedIndex ?? cleanData.length - 1),
  );
  const selected = geometry?.points[resolvedIndex];
  const selectAt = (event: PointerEvent<HTMLDivElement>) => {
    if (!geometry) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    let nearest = 0;
    let distance = Math.abs(geometry.points[0].x - x);
    for (let index = 1; index < geometry.points.length; index += 1) {
      const nextDistance = Math.abs(geometry.points[index].x - x);
      if (nextDistance < distance) {
        nearest = index;
        distance = nextDistance;
      }
    }
    setSelectedIndex(nearest);
  };

  return (
    <div
      ref={rootRef}
      role="slider"
      lang={locale}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={cleanData.length - 1}
      aria-valuenow={resolvedIndex}
      aria-valuetext={
        selected
          ? `${selected.label}, ${formatValue(selected.value, maximumFractionDigits)}`
          : undefined
      }
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft")
          setSelectedIndex(Math.max(0, resolvedIndex - 1));
        if (event.key === "ArrowRight")
          setSelectedIndex(Math.min(cleanData.length - 1, resolvedIndex + 1));
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        selectAt(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) selectAt(event);
      }}
      className="relative h-[142px] w-full touch-pan-y overflow-hidden rounded-surface outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {selected ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-7 items-center gap-3 px-2 text-mobile-micro font-medium">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {selected.label}
          </span>
          <span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums">
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {formatValue(selected.value, maximumFractionDigits)}
          </span>
        </div>
      ) : null}
      {geometry ? (
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          aria-hidden="true"
          className="absolute inset-0"
        >
          {geometry.yTicks.map((tick, index) => (
            <g key={index}>
              <line
                x1={PADDING.left}
                x2={PADDING.left + geometry.plotWidth}
                y1={tick.y}
                y2={tick.y}
                className="stroke-border/70 dark:stroke-border/60"
                strokeWidth="1"
              />
              <text
                x={PADDING.left + 4}
                y={tick.y - 5}
                className="fill-muted-foreground text-mobile-micro font-medium"
              >
                {formatValue(tick.value, maximumFractionDigits)}
              </text>
            </g>
          ))}
          <polyline
            points={geometry.points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.92"
          />
          {geometry.points.map((point, index) => (
            <g key={`${point.key}-${index}`}>
              <circle cx={point.x} cy={point.y} r="4.5" fill={color} opacity="0.12" />
              <circle cx={point.x} cy={point.y} r="2.3" fill={color} />
            </g>
          ))}
          {tickIndexes(geometry.points.length).map((index) => {
            const point = geometry.points[index];
            return (
              <text
                key={`x-${point.key}-${index}`}
                x={Math.max(24, Math.min(width - 24, point.x))}
                y={HEIGHT - 4}
                textAnchor="middle"
                className="fill-muted-foreground text-mobile-micro font-medium"
              >
                {point.label}
              </text>
            );
          })}
          {selected ? (
            <>
              <line
                x1={selected.x}
                x2={selected.x}
                y1={PADDING.top}
                y2={PADDING.top + geometry.plotHeight}
                className="stroke-muted-foreground/55"
                strokeWidth="1"
              />
              <circle
                cx={selected.x}
                cy={selected.y}
                r="6"
                className="fill-background stroke-background"
                strokeWidth="2"
              />
              <circle cx={selected.x} cy={selected.y} r="3" fill={color} />
            </>
          ) : null}
        </svg>
      ) : null}
    </div>
  );
}
