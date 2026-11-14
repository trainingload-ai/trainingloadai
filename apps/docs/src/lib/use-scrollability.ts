"use client";

import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";

export function useScrollability(
  ref: RefObject<HTMLElement | null>,
  selector?: string,
) {
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const root = ref.current;
    const element = selector
      ? root?.querySelector<HTMLElement>(selector)
      : root;
    if (!element) return;
    const update = () =>
      setScrollable(
        element.scrollWidth > element.clientWidth + 1 ||
          element.scrollHeight > element.clientHeight + 1,
      );
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    update();
    return () => observer.disconnect();
  }, [ref, selector]);
  return scrollable;
}

/** Safari does not consistently scroll focused overflow regions with arrow keys. */
export function scrollRegionByKeyboard(event: KeyboardEvent<HTMLElement>) {
  if (
    event.defaultPrevented ||
    event.target !== event.currentTarget ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  )
    return;
  const element = event.currentTarget;
  if (
    element.scrollWidth <= element.clientWidth + 1 ||
    !["ArrowLeft", "ArrowRight"].includes(event.key)
  )
    return;
  event.preventDefault();
  element.scrollBy({
    left: event.key === "ArrowRight" ? 40 : -40,
    behavior: "instant",
  });
}
