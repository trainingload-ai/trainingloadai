"use client";

import dayjs from "dayjs";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export type CalendarScrollDirection = 1 | -1;
export type CalendarScrollUnit = "week" | "month";
export type NavigateCalendar = (
  direction: CalendarScrollDirection,
  unit: CalendarScrollUnit,
  fromMonth?: string,
) => void;
export type SyncCalendarWeek = (week: string, month: string) => void;

const WHEEL_GESTURE_IDLE_MS = 360;
const SCROLL_END_SETTLE_MS = 64;
const SCROLL_FALLBACK_IDLE_MS = 120;
const PAGING_WHEEL_IDLE_MS = 140;
const FLICK_WINDOW_MS = 180;
const FLICK_SINGLE_ROWS = 6;
const FLICK_TRAVEL_ROWS = 2.05;
const FLICK_ROWS_PER_SECOND = 18;
const FLICK_VELOCITY_WINDOW_MS = 72;
const FLICK_MIN_DURATION_MS = 180;
const FLICK_MAX_DURATION_MS = 460;
const SNAP_BASE_MS = 100;
const SNAP_EXTRA_MS = 40;
const EDGE_BAND = 32;
const EDGE_STEP_MS = 540;

type WeekPosition = { week: string; offset: number };
type WheelSample = {
  at: number;
  delta: number;
  month: string;
};
type WheelGesture = {
  lastAt: number;
  direction: CalendarScrollDirection;
  rowHeight: number;
  samples: WheelSample[];
  paged: boolean;
  hasNonCancelablePackets: boolean;
};

function getWeekRows(element: HTMLElement) {
  return Array.from(element.querySelectorAll<HTMLElement>("[data-calendar-week]"));
}

function getVisibleMonth(
  rows: HTMLElement[],
  top: number,
  height: number,
  preferredMonth: string,
) {
  const visibleDays = new Map<string, number>();
  const add = (month: string, days: number) =>
    visibleDays.set(month, (visibleDays.get(month) ?? 0) + days);

  for (const row of rows) {
    const rowTop = row.offsetTop;
    if (rowTop >= top + height) break;
    const rowHeight = row.offsetHeight;
    const overlap =
      Math.min(rowTop + rowHeight, top + height) - Math.max(rowTop, top);
    const start = row.dataset.calendarWeek;
    const end = row.dataset.calendarWeekEnd;
    if (overlap <= 0 || !start || !end) continue;
    const weight = overlap / rowHeight;
    const startMonth = start.slice(0, 7);
    const endMonth = end.slice(0, 7);
    const endDays = startMonth === endMonth ? 7 : Number(end.slice(8));
    if (endDays < 7) add(startMonth, (7 - endDays) * weight);
    add(endMonth, endDays * weight);
  }

  let month = preferredMonth;
  let mostDays = visibleDays.get(month) ?? 0;
  for (const [candidate, days] of visibleDays) {
    if (days <= mostDays + 0.001) continue;
    month = candidate;
    mostDays = days;
  }
  return month;
}

function scrollBehavior(smooth: boolean): ScrollBehavior {
  return smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "smooth"
    : "instant";
}

export function useCalendarWeekScroll(
  anchor: string | undefined,
  initialMonth: string,
  navigate: NavigateCalendar | undefined,
  syncWeek: SyncCalendarWeek | undefined,
  onVisibleMonth: ((month: string) => void) | undefined,
  dragging: boolean,
) {
  const viewport = useRef<HTMLDivElement>(null);
  const previousAnchor = useRef<string>(undefined);
  const [visibleWeek, setVisibleWeek] = useState(anchor);
  const settledMonth = useRef(initialMonth);
  const position = useRef<WeekPosition | null>(null);
  const rebasing = useRef<string | null>(null);
  const programmaticTop = useRef<number | null>(null);
  const snapFrame = useRef<number | undefined>(undefined);
  const navigateRef = useRef(navigate);
  const syncWeekRef = useRef(syncWeek);
  const onVisibleMonthRef = useRef(onVisibleMonth);
  const scrollEnabled = Boolean(navigate);

  const cancelSnap = useCallback(() => {
    if (snapFrame.current !== undefined) cancelAnimationFrame(snapFrame.current);
    snapFrame.current = undefined;
  }, []);

  const publishMonth = useCallback(
    (element: HTMLElement, rows = getWeekRows(element)) => {
      const month = getVisibleMonth(
        rows,
        element.scrollTop,
        element.clientHeight,
        settledMonth.current,
      );
      if (month !== settledMonth.current) {
        settledMonth.current = month;
        onVisibleMonthRef.current?.(month);
      }
      return month;
    },
    [],
  );

  useLayoutEffect(() => {
    navigateRef.current = navigate;
    syncWeekRef.current = syncWeek;
    onVisibleMonthRef.current = onVisibleMonth;
  }, [navigate, onVisibleMonth, syncWeek]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || !anchor) return;
    const align = () => {
      const findRow = (date: string) =>
        element.querySelector<HTMLElement>(`[data-calendar-week="${date}"]`);
      const next = findRow(anchor);
      if (!next) return;
      cancelSnap();
      const previous = position.current;
      previousAnchor.current = anchor;
      const start = previous ? findRow(previous.week) : null;
      if (start && previous) {
        // The rendered window can shift without changing the date under the pointer.
        const visualTop = start.offsetTop + previous.offset;
        if (Math.abs(visualTop - element.scrollTop) > 1)
          element.scrollTo({ top: visualTop, behavior: "instant" });
      }
      if (rebasing.current === anchor) {
        rebasing.current = null;
        return;
      }
      rebasing.current = null;
      const top = next.offsetTop;
      const behavior = scrollBehavior(
        Boolean(start) && Math.abs(top - element.scrollTop) > 1,
      );
      programmaticTop.current = behavior === "smooth" ? top : null;
      element.scrollTo({ top, behavior });
      if (behavior === "instant") {
        position.current = { week: anchor, offset: 0 };
        setVisibleWeek(anchor);
        publishMonth(element);
      }
    };
    if (element.clientHeight) {
      align();
      return;
    }
    const resize = new ResizeObserver(() => {
      if (!element.clientHeight) return;
      resize.disconnect();
      align();
    });
    resize.observe(element);
    return () => resize.disconnect();
  }, [anchor, cancelSnap, publishMonth]);

  useEffect(() => {
    const element = viewport.current;
    if (!element || !scrollEnabled) return;
    const supportsScrollEnd = "onscrollend" in element;
    const originalOverflow = element.style.overflowY;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pagingTimer: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;
    let gesture: WheelGesture | undefined;
    let waitingForScrollEnd = false;
    let viewportMonth = settledMonth.current;

    const endPaging = () => {
      if (pagingTimer === undefined) return;
      clearTimeout(pagingTimer);
      pagingTimer = undefined;
      element.style.overflowY = originalOverflow;
    };

    const holdPaging = (idleMs: number) => {
      // Later wheel events in a native gesture can be non-cancelable.
      if (pagingTimer === undefined) element.style.overflowY = "hidden";
      clearTimeout(pagingTimer);
      pagingTimer = setTimeout(endPaging, idleMs);
    };

    const pagingIdle = (wheel: WheelGesture) =>
      wheel.hasNonCancelablePackets ? WHEEL_GESTURE_IDLE_MS : PAGING_WHEEL_IDLE_MS;

    const canSettle = () =>
      !dragging &&
      pagingTimer === undefined &&
      programmaticTop.current === null &&
      snapFrame.current === undefined;

    const readRows = () => {
      if (!element.clientHeight) return;
      const rows = getWeekRows(element);
      const top = element.scrollTop;
      const index = Math.max(
        0,
        rows.findLastIndex((row) => row.offsetTop <= top + 1),
      );
      const row = rows[index];
      const week = row?.dataset.calendarWeek;
      if (!week) return;
      const offset = top - row.offsetTop;
      position.current = { week, offset };
      setVisibleWeek(week);
      viewportMonth = getVisibleMonth(
        rows,
        top,
        element.clientHeight,
        viewportMonth,
      );
      return { rows, row, week, month: viewportMonth, offset, index };
    };

    const completeNavigation = () => {
      const target = programmaticTop.current;
      if (target === null || Math.abs(element.scrollTop - target) > 1)
        return false;
      programmaticTop.current = null;
      clearTimeout(timer);
      timer = undefined;
      publishMonth(element);
      return true;
    };

    const animateScroll = (
      targetTop: number,
      duration: number,
      entrySlope: number,
      onAligned: () => void,
    ) => {
      const startTop = element.scrollTop;
      const distance = targetTop - startTop;
      const startedAt = performance.now();
      const animate = (now: number) => {
        const progress = Math.min(Math.max(0, now - startedAt) / duration, 1);
        // The curve starts with the supplied slope and stops at the target.
        const eased = 1 - (1 - progress) ** 2 * (1 - (entrySlope - 2) * progress);
        element.scrollTo({
          top: startTop + distance * eased,
          behavior: "instant",
        });
        if (progress < 1) {
          snapFrame.current = requestAnimationFrame(animate);
          return;
        }
        snapFrame.current = undefined;
        onAligned();
      };
      snapFrame.current = requestAnimationFrame(animate);
    };

    const finish = () => {
      timer = undefined;
      if (completeNavigation()) return;
      programmaticTop.current = null;
      if (!canSettle() || waitingForScrollEnd) return;
      const current = readRows();
      if (!current) return;
      const next = current.rows[current.index + 1];
      const closest =
        next && next.offsetTop - element.scrollTop < current.offset
          ? next
          : current.row;
      const week = closest.dataset.calendarWeek;
      if (!week) return;

      const startTop = element.scrollTop;
      const targetTop = closest.offsetTop;
      const distance = targetTop - startTop;
      const alignWeek = () => {
        position.current = { week, offset: 0 };
        setVisibleWeek(week);
        const month = publishMonth(element, current.rows);
        if (week !== previousAnchor.current) {
          rebasing.current = week;
          syncWeekRef.current?.(week, month);
        }
      };

      if (Math.abs(distance) <= 1 || scrollBehavior(true) === "instant") {
        if (distance !== 0)
          element.scrollTo({ top: targetTop, behavior: "instant" });
        alignWeek();
        return;
      }

      // Native scrolling has settled. Ease only the remaining distance to the row.
      const duration =
        SNAP_BASE_MS + Math.min(SNAP_EXTRA_MS, Math.abs(distance) * 1.4);
      animateScroll(targetTop, duration, 2, alignWeek);
    };
    const scheduleFinish = (idleMs = SCROLL_FALLBACK_IDLE_MS) => {
      clearTimeout(timer);
      timer = setTimeout(finish, idleMs);
    };

    const onScroll = () => {
      if (supportsScrollEnd && canSettle()) waitingForScrollEnd = true;
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        const current = readRows();
        if (!current) return;
        if (programmaticTop.current !== null) {
          if (!supportsScrollEnd || timer !== undefined) scheduleFinish();
          return;
        }
        if (!canSettle()) return;
        const rowHeight = current.row.offsetHeight;
        const remaining =
          element.scrollHeight - element.clientHeight - element.scrollTop;
        if (
          (element.scrollTop < rowHeight * 2 || remaining < rowHeight * 2) &&
          current.week !== previousAnchor.current &&
          rebasing.current !== current.week
        ) {
          rebasing.current = current.week;
          syncWeekRef.current?.(current.week, current.month);
        }
        if (!supportsScrollEnd) scheduleFinish();
      });
    };

    const onScrollEnd = () => {
      waitingForScrollEnd = false;
      if (
        !completeNavigation() &&
        (programmaticTop.current !== null || canSettle())
      )
        // Separate wheel packets can each emit scrollend. Allow the next packet to arrive.
        scheduleFinish(SCROLL_END_SETTLE_MS);
    };

    const onWheel = (event: WheelEvent) => {
      const pixelInput = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL;
      if (
        dragging ||
        event.ctrlKey ||
        event.metaKey ||
        Math.abs(event.deltaY) <= Math.abs(event.deltaX)
      )
        return;

      const now = event.timeStamp;
      const direction = event.deltaY > 0 ? 1 : -1;
      const delta = Math.abs(event.deltaY);
      // A cancelable first packet can follow a compositor-owned wheel transaction.
      const startsNewGesture = event.cancelable && gesture?.hasNonCancelablePackets;
      if (
        pixelInput &&
        gesture?.paged &&
        !startsNewGesture &&
        now - gesture.lastAt <= pagingIdle(gesture) &&
        direction === gesture.direction
      ) {
        gesture.lastAt = now;
        gesture.hasNonCancelablePackets ||= !event.cancelable;
        if (event.cancelable) event.preventDefault();
        holdPaging(pagingIdle(gesture));
        return;
      }

      endPaging();
      cancelSnap();
      programmaticTop.current = null;
      scheduleFinish();
      if (!pixelInput) {
        gesture = undefined;
        return;
      }
      if (
        !gesture ||
        gesture.paged ||
        direction !== gesture.direction ||
        now - gesture.lastAt > WHEEL_GESTURE_IDLE_MS
      ) {
        const current = readRows();
        if (!current) return;
        gesture = {
          lastAt: now,
          direction,
          rowHeight: current.row.offsetHeight,
          samples: [],
          paged: false,
          hasNonCancelablePackets: false,
        };
      }
      gesture.lastAt = now;
      gesture.hasNonCancelablePackets ||= !event.cancelable;
      const sample = {
        at: now,
        delta,
        month: viewportMonth,
      };
      gesture.samples = gesture.samples.filter(
        ({ at }) => now - at <= FLICK_WINDOW_MS,
      );
      gesture.samples.push(sample);
      const { rowHeight, samples } = gesture;
      const first = samples[0];
      const travel = samples.reduce((total, item) => total + item.delta, 0);
      const elapsed = Math.max(50, now - first.at + 12);
      const veryFastFlick =
        delta >= rowHeight * FLICK_SINGLE_ROWS ||
        (samples.length >= 3 &&
          travel >= rowHeight * FLICK_TRAVEL_ROWS &&
          (travel * 1000) / elapsed >= rowHeight * FLICK_ROWS_PER_SECOND);
      if (veryFastFlick) {
        if (event.cancelable) event.preventDefault();
        gesture.paged = true;
        clearTimeout(timer);
        timer = undefined;
        holdPaging(pagingIdle(gesture));
        const current = readRows();
        rebasing.current = null;
        const navigateMonth = () =>
          navigateRef.current?.(direction, "month", first.month);
        const targetDate = dayjs(`${first.month}-01`)
          .add(direction, "month")
          .format("YYYY-MM-DD");
        const target = current?.rows.find(
          ({ dataset: { calendarWeek, calendarWeekEnd } }) =>
            calendarWeek && calendarWeekEnd &&
            calendarWeek <= targetDate && calendarWeekEnd >= targetDate,
        );
        const week = target?.dataset.calendarWeek;
        if (!current || !target || !week || scrollBehavior(true) === "instant") {
          navigateMonth();
          return;
        }
        const top = target.offsetTop;
        const distance = (top - element.scrollTop) * direction;
        if (distance <= 1 || top > element.scrollHeight - element.clientHeight) {
          navigateMonth();
          return;
        }

        const recent = samples.filter(
          ({ at }) => now - at <= FLICK_VELOCITY_WINDOW_MS,
        );
        const velocity =
          recent.slice(1).reduce((sum, item) => sum + item.delta, 0) /
          Math.max(16, now - recent[0].at);
        const duration = velocity > 0
          ? Math.max(
              FLICK_MIN_DURATION_MS,
              Math.min(FLICK_MAX_DURATION_MS, (3 * distance) / velocity),
            )
          : (FLICK_MIN_DURATION_MS + FLICK_MAX_DURATION_MS) / 2;
        const entrySlope = velocity > 0 ? Math.min(3, velocity * duration / distance) : 3;

        // Start on the rendered weeks; only recenter the date window after landing.
        animateScroll(top, duration, entrySlope, () => {
          position.current = { week, offset: 0 };
          setVisibleWeek(week);
          viewportMonth = publishMonth(element, current.rows);
          rebasing.current = week;
          navigateMonth();
        });
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("scroll", onScroll, { passive: true });
    if (supportsScrollEnd) element.addEventListener("scrollend", onScrollEnd);
    const resize = new ResizeObserver(() => {
      const current = readRows();
      if (current && !waitingForScrollEnd && timer === undefined && canSettle())
        publishMonth(element, current.rows);
    });
    resize.observe(element);
    return () => {
      clearTimeout(timer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      cancelSnap();
      endPaging();
      resize.disconnect();
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("scroll", onScroll);
      element.removeEventListener("scrollend", onScrollEnd);
    };
  }, [cancelSnap, dragging, publishMonth, scrollEnabled]);

  useEffect(() => {
    const element = viewport.current;
    if (!element || !scrollEnabled || !dragging) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let edge: CalendarScrollDirection | null = null;
    const stop = () => {
      clearInterval(timer);
      edge = null;
    };
    // Keep edge tracking independent of the day cells moving under the pointer.
    const track = ({ clientX, clientY }: DragEvent) => {
      const { top, bottom, left, right } = element.getBoundingClientRect();
      const inside =
        clientX >= left &&
        clientX <= right &&
        clientY >= top - 8 &&
        clientY <= bottom + 8;
      const next = !inside
        ? null
        : clientY < top + EDGE_BAND
          ? -1
          : clientY > bottom - EDGE_BAND
            ? 1
            : null;
      if (next === edge) return;
      stop();
      if (next) {
        edge = next;
        timer = setInterval(
          () => navigateRef.current?.(next, "week"),
          EDGE_STEP_MS,
        );
      }
    };
    window.addEventListener("dragenter", track, true);
    window.addEventListener("dragover", track, true);
    window.addEventListener("drop", stop, true);
    window.addEventListener("dragend", stop, true);
    window.addEventListener("blur", stop);
    return () => {
      stop();
      window.removeEventListener("dragenter", track, true);
      window.removeEventListener("dragover", track, true);
      window.removeEventListener("drop", stop, true);
      window.removeEventListener("dragend", stop, true);
      window.removeEventListener("blur", stop);
    };
  }, [dragging, scrollEnabled]);

  function browseWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const direction =
      event.key === "ArrowDown" || event.key === "PageDown"
        ? 1
        : event.key === "ArrowUp" || event.key === "PageUp"
          ? -1
          : null;
    if (direction) {
      event.preventDefault();
      navigateRef.current?.(
        direction,
        event.key.startsWith("Page") ? "month" : "week",
      );
    }
  }

  return { viewport, visibleWeek, browseWithKeyboard };
}
