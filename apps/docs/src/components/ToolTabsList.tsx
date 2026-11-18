"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import styles from "./tool-tabs.module.css";

export function ToolTabsList({
  value,
  label,
  options,
}: {
  value: string;
  label: string;
  options: readonly { value: string; label: ReactNode }[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = ref.current;
    const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !selected || list.scrollWidth <= list.clientWidth) return;
    const bounds = list.getBoundingClientRect();
    const item = selected.getBoundingClientRect();
    const delta =
      item.left < bounds.left
        ? item.left - bounds.left
        : Math.max(0, item.right - bounds.right);
    if (delta) list.scrollBy({ left: delta, behavior: "instant" });
  }, [value]);

  return (
    <TabsList
      ref={ref}
      aria-label={label}
      data-slot="tool-tabs"
      className={styles.list}
    >
      {options.map((option) => (
        <TabsTrigger
          key={option.value}
          value={option.value}
          type="button"
          className={styles.tab}
        >
          {option.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
