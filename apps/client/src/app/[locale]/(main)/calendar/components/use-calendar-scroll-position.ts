"use client";

import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useMemo, useState } from "react";

export function useCalendarScrollPosition(initialDate: () => Dayjs) {
  const [currentMonth, setCurrentMonth] = useState(initialDate);
  const [visibleMonth, setVisibleMonth] = useState(() => currentMonth.format("YYYY-MM"));
  const [scrollAnchor, setScrollAnchor] = useState<Dayjs | null>(null);
  const displayedMonth = useMemo(() => dayjs(`${visibleMonth}-01`), [visibleMonth]);
  const resetScrollAnchor = useCallback((month?: Dayjs) => {
    setScrollAnchor(null);
    if (month) setVisibleMonth(month.format("YYYY-MM"));
  }, []);
  const syncScrollWeek = useCallback((week: string, month: string) => {
    setScrollAnchor(dayjs(week));
    const target = dayjs(`${month}-01`);
    setCurrentMonth((current) => current.isSame(target, "month") ? current : target);
  }, []);

  return {
    currentMonth,
    setCurrentMonth,
    displayedMonth,
    resetScrollAnchor,
    scroll: { scrollAnchor, onScrollWeek: syncScrollWeek, onVisibleMonth: setVisibleMonth },
  };
}
