import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCssVarResolver } from "@/components/charts/uplot/useElementSize";

export type DurationKey = "5s" | "1m" | "5m" | "FTP";

export type ProfileType =
  | "All Rounder"
  | "Pursuiter"
  | "Sprinter"
  | "Time Trialist";

export const PROFILE_TYPE_INFO: Record<
  ProfileType,
  {
    key: "allRounder" | "pursuiter" | "sprinter" | "timeTrialist";
  }
> = {
  "All Rounder": {
    key: "allRounder",
  },
  Pursuiter: {
    key: "pursuiter",
  },
  Sprinter: {
    key: "sprinter",
  },
  "Time Trialist": {
    key: "timeTrialist",
  },
};

function parseNumberOrPercent(value: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) {
    const n = Number(trimmed.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : NaN;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN;
}

function parseOklch(
  color: string,
): { l: number; c: number; h: number; a: number } | null {
  const m = color
    .trim()
    .match(
      /^oklch\(\s*([0-9.]+%?)\s+([0-9.]+)\s+([0-9.]+)(?:deg)?\s*(?:\/\s*([0-9.]+%?)\s*)?\)$/i,
    );
  if (!m) return null;
  const l = parseNumberOrPercent(m[1]);
  const c = Number(m[2]);
  const h = Number(m[3]);
  const a = m[4] ? parseNumberOrPercent(m[4]) : 1;
  if (![l, c, h, a].every((n) => Number.isFinite(n))) return null;
  return { l, c, h, a };
}

function clamp01(v: number) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function linearToSrgb(v: number) {
  const c = clamp01(v);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function oklchToRgbString(l: number, c: number, hDeg: number, alpha = 1) {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const rLin = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  const r = Math.round(linearToSrgb(rLin) * 255);
  const g = Math.round(linearToSrgb(gLin) * 255);
  const bb = Math.round(linearToSrgb(bLin) * 255);

  const aClamped = clamp01(alpha);
  return aClamped < 1
    ? `rgba(${r}, ${g}, ${bb}, ${aClamped})`
    : `rgb(${r}, ${g}, ${bb})`;
}

function normalizeColorForSvg(color: string) {
  const ok = parseOklch(color);
  if (!ok) return color;
  return oklchToRgbString(ok.l, ok.c, ok.h, ok.a);
}

export function useResolvedChartColor(cssVarName = "--chart-1") {
  const cssVar = useCssVarResolver();
  return useMemo(() => {
    return normalizeColorForSvg(cssVar(`var(${cssVarName})`));
  }, [cssVar, cssVarName]);
}

export function usePolylineFromRefs<K extends string>(args: {
  keys: readonly K[];
  watchToken?: unknown;
}) {
  const { keys, watchToken } = args;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<K, HTMLSpanElement | null>>(
    {} as Record<K, HTMLSpanElement | null>,
  );
  const [pointsByKey, setPointsByKey] = useState<
    Partial<Record<K, { x: number; y: number }>>
  >({});

  const keysRef = useRef(keys);
  useEffect(() => {
    keysRef.current = keys;
  }, [keys]);

  const rafRef = useRef<number | null>(null);
  const update = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const base = wrapperRef.current;
      if (!base) return;
      const baseRect = base.getBoundingClientRect();
      const next: Partial<Record<K, { x: number; y: number }>> = {};
      keysRef.current.forEach((k) => {
        const node = nodeRefs.current[k];
        if (!node) return;
        const r = node.getBoundingClientRect();
        next[k] = {
          x: r.left + r.width / 2 - baseRect.left,
          y: r.top + r.height / 2 - baseRect.top,
        };
      });
      setPointsByKey(next);
    });
  }, []);

  const registerRef = useCallback(
    (key: K) => (node: HTMLSpanElement | null) => {
      nodeRefs.current[key] = node;
      update();
    },
    [update],
  );

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    window.addEventListener("resize", update);
    update();

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [update]);

  useEffect(() => {
    void watchToken;
    update();
  }, [update, watchToken]);

  const polylinePoints = useMemo(() => {
    const pts = keys
      .map((k) => pointsByKey[k])
      .filter((p): p is { x: number; y: number } => !!p);
    if (pts.length < 2) return null;
    return pts.map((p) => `${p.x},${p.y}`).join(" ");
  }, [keys, pointsByKey]);

  return { wrapperRef, registerRef, polylinePoints };
}
