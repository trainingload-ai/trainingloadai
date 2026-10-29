"use client";

import { useMemo, useRef } from "react";
import uPlot from "uplot";

type Size = { width: number; height: number };

export type UplotDomTooltipRender = (args: {
  idx: number;
  u: uPlot;
  contentEl: HTMLDivElement;
}) => void;

export type UseUplotDomTooltipOptions = {
  wrapperRef: React.RefObject<HTMLElement | null>;
  render: UplotDomTooltipRender;
  throttleMs?: number;
  cursorOffset?: number;
  margin?: number;
  keepLastIdxOnNull?: boolean;
  rootClassName?: string;
  contentClassName?: string;
};

export function useUplotDomTooltip({
  wrapperRef,
  render,
  throttleMs = 16,
  cursorOffset = 12,
  margin = 8,
  keepLastIdxOnNull = true,
  rootClassName = "absolute z-10 pointer-events-none top-0 left-0 will-change-transform",
  contentClassName = "border-border/50 bg-background grid min-w-32 items-start gap-1.5 rounded-compact border px-2.5 py-1.5 text-xs shadow-xl",
}: UseUplotDomTooltipOptions) {
  const tooltipRootRef = useRef<HTMLDivElement | null>(null);
  const tooltipContentRef = useRef<HTMLDivElement | null>(null);
  const lastIdxRef = useRef<number | null>(null);
  const lastPosRef = useRef<{ left: number; top: number } | null>(null);
  const sizeRef = useRef<Size | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastFlushMsRef = useRef<number>(0);
  const pendingURef = useRef<uPlot | null>(null);

  const plugin = useMemo((): uPlot.Plugin => {
    const hide = () => {
      const rootEl = tooltipRootRef.current;
      if (rootEl) rootEl.style.display = "none";
      lastIdxRef.current = null;
      lastPosRef.current = null;
      sizeRef.current = null;
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingURef.current = null;
    };

    const updatePosition = (args: {
      baseLeft: number;
      baseTop: number;
      cursorLeft: number;
      cursorTop: number;
      overW: number;
      overH: number;
      wrapperW: number;
      wrapperH: number;
      tooltipW: number;
      tooltipH: number;
    }) => {
      const isRightSide = args.cursorLeft > args.overW / 2;
      const isBottomSide = args.cursorTop > args.overH / 2;

      let left = isRightSide
        ? args.baseLeft - args.tooltipW - cursorOffset
        : args.baseLeft + cursorOffset;
      let top = isBottomSide
        ? args.baseTop - args.tooltipH - cursorOffset
        : args.baseTop + cursorOffset;

      left = Math.max(
        margin,
        Math.min(left, args.wrapperW - args.tooltipW - margin),
      );
      top = Math.max(
        margin,
        Math.min(top, args.wrapperH - args.tooltipH - margin),
      );

      return { left, top };
    };

    const flush = (u: uPlot) => {
      const rootEl = tooltipRootRef.current;
      const contentEl = tooltipContentRef.current;
      const wrapperEl = wrapperRef.current;
      const cursorLeft = u.cursor.left;
      const cursorTop = u.cursor.top;
      const rawIdx = u.cursor.idx ?? null;

      if (
        !rootEl ||
        !contentEl ||
        !wrapperEl ||
        cursorLeft == null ||
        cursorTop == null
      ) {
        hide();
        return;
      }

      const overRect = u.over.getBoundingClientRect();
      const wrapperRect = wrapperEl.getBoundingClientRect();
      const baseLeft = overRect.left - wrapperRect.left + cursorLeft;
      const baseTop = overRect.top - wrapperRect.top + cursorTop;

      if (rawIdx != null && rawIdx !== lastIdxRef.current) {
        lastIdxRef.current = rawIdx;
        render({ idx: rawIdx, u, contentEl });
        const r = contentEl.getBoundingClientRect();
        sizeRef.current = {
          width: Math.ceil(r.width),
          height: Math.ceil(r.height),
        };
      }

      const visibleIdx =
        rawIdx != null ? rawIdx : keepLastIdxOnNull ? lastIdxRef.current : null;
      if (visibleIdx == null) {
        rootEl.style.display = "none";
        return;
      }

      rootEl.style.display = "block";

      const size =
        sizeRef.current ??
        (() => {
          const r = contentEl.getBoundingClientRect();
          const s = { width: Math.ceil(r.width), height: Math.ceil(r.height) };
          sizeRef.current = s;
          return s;
        })();

      const nextPos = updatePosition({
        baseLeft,
        baseTop,
        cursorLeft,
        cursorTop,
        overW: overRect.width,
        overH: overRect.height,
        wrapperW: wrapperRect.width,
        wrapperH: wrapperRect.height,
        tooltipW: size.width,
        tooltipH: size.height,
      });

      const lastPos = lastPosRef.current;
      if (
        !lastPos ||
        lastPos.left !== nextPos.left ||
        lastPos.top !== nextPos.top
      ) {
        lastPosRef.current = nextPos;
        rootEl.style.transform = `translate3d(${nextPos.left}px, ${nextPos.top}px, 0)`;
      }
    };

    const schedule = (u: uPlot) => {
      pendingURef.current = u;
      if (rafIdRef.current != null) return;

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const pending = pendingURef.current;
        if (!pending) return;

        const now = performance.now();
        if (throttleMs > 0 && now - lastFlushMsRef.current < throttleMs) {
          schedule(pending);
          return;
        }

        lastFlushMsRef.current = now;
        flush(pending);
      });
    };

    return {
      hooks: {
        init: [
          (u) => {
            const overEl = u.over as HTMLElement;
            overEl.addEventListener("mouseleave", hide);
            overEl.addEventListener("touchend", hide);
            overEl.addEventListener("touchcancel", hide);
          },
        ],
        destroy: [
          (u) => {
            const overEl = u.over as HTMLElement;
            overEl.removeEventListener("mouseleave", hide);
            overEl.removeEventListener("touchend", hide);
            overEl.removeEventListener("touchcancel", hide);
            hide();
          },
        ],
        setCursor: [
          (u) => {
            schedule(u);
          },
        ],
      },
    };
  }, [cursorOffset, keepLastIdxOnNull, margin, render, throttleMs, wrapperRef]);

  const tooltip = useMemo(() => {
    return (
      <div
        ref={tooltipRootRef}
        className={rootClassName}
        style={{ display: "none" }}
      >
        <div ref={tooltipContentRef} className={contentClassName} />
      </div>
    );
  }, [contentClassName, rootClassName]);

  return { plugin, tooltip };
}
