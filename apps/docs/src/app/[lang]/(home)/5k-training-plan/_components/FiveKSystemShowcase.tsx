"use client";

import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { TrackedLink } from "@/components/TrackedLink";
import type { RunningPlanSlug } from "@/lib/running-plan-pages";
import { FiveKSystemPreview } from "./FiveKProductPreview";
import styles from "../five-k-training-plan.module.css";

type SystemModule = {
  name: string;
  title: string;
  description: string;
  points: string[];
  cta?: string;
};

const KINDS = ["calendar", "analysis", "coach"] as const;

export function FiveKSystemShowcase({
  modules,
  lang,
  slug,
  prefix,
  calendarHref,
  calendarLabel,
}: {
  modules: SystemModule[];
  lang: string;
  slug: RunningPlanSlug;
  prefix: string;
  calendarHref: string;
  calendarLabel: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeModule = modules[activeIndex];
  const kind = KINDS[activeIndex] ?? "calendar";

  if (!activeModule) return null;

  const moduleHref =
    kind === "analysis"
      ? `${prefix}/training-load`
      : kind === "coach"
        ? `${prefix}/ai-coach`
        : calendarHref;

  const selectTab = (nextIndex: number) => {
    setActiveIndex(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  };

  const selectAdjacent = (direction: -1 | 1) => {
    selectTab((activeIndex + direction + modules.length) % modules.length);
  };

  return (
    <div className={styles.systemShowcase}>
      <div
        className={styles.systemTabs}
        role="tablist"
        aria-label="Trainingload.ai"
        aria-orientation="vertical"
      >
        {modules.map((module, index) => (
          <button
            key={module.name}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            id={`system-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={activeIndex === index}
            aria-controls="system-panel"
            tabIndex={activeIndex === index ? 0 : -1}
            className={
              activeIndex === index ? styles.systemTabActive : undefined
            }
            onClick={() => setActiveIndex(index)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                selectAdjacent(-1);
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                selectAdjacent(1);
              }
              if (event.key === "Home") {
                event.preventDefault();
                selectTab(0);
              }
              if (event.key === "End") {
                event.preventDefault();
                selectTab(modules.length - 1);
              }
            }}
          >
            <span className={styles.systemTabIndex}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className={styles.systemTabCopy}>
              <small>{module.name}</small>
              <strong>{module.title}</strong>
              <span>{module.description}</span>
            </span>
            <ArrowRight aria-hidden="true" />
          </button>
        ))}
      </div>

      <article
        id="system-panel"
        role="tabpanel"
        aria-labelledby={`system-tab-${activeIndex}`}
        className={styles.systemPanel}
      >
        <FiveKSystemPreview
          kind={kind}
          lang={lang}
          label={activeModule.title}
          planSlug={slug}
        />
        <div className={styles.systemPanelFooter}>
          <span>{activeModule.points.join(" · ")}</span>
          <TrackedLink
            href={moduleHref}
            eventName="plan_product_module_click"
            eventProperties={{
              slug,
              module: activeModule.name,
              placement: "system_flow",
            }}
            className={styles.textLink}
          >
            {activeModule.cta ?? calendarLabel}
            <ArrowRight aria-hidden="true" />
          </TrackedLink>
        </div>
      </article>
    </div>
  );
}
