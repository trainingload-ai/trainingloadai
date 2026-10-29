"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type ThemeSwitcherProps = {
  variant?: "compact" | "labeled";
  lightLabel?: string;
  darkLabel?: string;
  groupLabel?: string;
};

function labeledOptionClass(active: boolean) {
  return [
    "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-control px-3 text-sm transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
    active
      ? "bg-card font-semibold text-foreground shadow-xs"
      : "text-muted-foreground hover:text-foreground",
  ].join(" ");
}

export function ThemeSwitcher({
  variant = "compact",
  lightLabel = "Light",
  darkLabel = "Dark",
  groupLabel,
}: ThemeSwitcherProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (variant === "labeled") {
    if (!mounted) {
      return (
        <div
          aria-hidden="true"
          className="grid h-10 grid-cols-2 gap-1 rounded-control bg-secondary p-0.5"
        />
      );
    }

    const isDark = resolvedTheme === "dark";

    return (
      <div
        role="group"
        aria-label={groupLabel}
        className="grid grid-cols-2 gap-1 rounded-control bg-secondary p-0.5"
      >
        <button
          type="button"
          aria-pressed={!isDark}
          onClick={() => setTheme("light")}
          className={labeledOptionClass(!isDark)}
        >
          <Sun className="size-3.5" aria-hidden="true" />
          {lightLabel}
        </button>
        <button
          type="button"
          aria-pressed={isDark}
          onClick={() => setTheme("dark")}
          className={labeledOptionClass(isDark)}
        >
          <Moon className="size-3.5" aria-hidden="true" />
          {darkLabel}
        </button>
      </div>
    );
  }

  if (!mounted) {
    return <div className="h-9 w-9 rounded-control bg-secondary" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex size-9 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={groupLabel ?? "Toggle theme"}
    >
      {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  );
}
