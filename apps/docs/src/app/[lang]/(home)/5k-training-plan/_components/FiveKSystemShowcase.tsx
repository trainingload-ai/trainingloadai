"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  const id = useId();
  const panelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    const listeners = panelRefs.current.map((panel, index) => {
      const reveal = () => setActiveIndex(index);
      panel?.addEventListener("beforematch", reveal);
      return () => panel?.removeEventListener("beforematch", reveal);
    });
    return () => listeners.forEach((remove) => remove());
  }, []);

  if (!modules.length) return null;

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
            id={`${id}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={activeIndex === index}
            tabIndex={activeIndex === index ? 0 : -1}
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

      <div className={styles.systemPanels}>
        {modules.map((module, index) => {
          const kind = KINDS[index] ?? "calendar";
          const href =
            kind === "analysis"
              ? `${prefix}/training-load`
              : kind === "coach"
                ? `${prefix}/ai-coach`
                : calendarHref;
          return (
            <div
              key={module.name}
              ref={(node) => {
                panelRefs.current[index] = node;
                // React normalizes hidden to a boolean; enhance the hydrated panel.
                if (node && activeIndex !== index)
                  node.setAttribute("hidden", "until-found");
              }}
              id={`${id}-panel-${index}`}
              role="tabpanel"
              aria-labelledby={`${id}-tab-${index}`}
              hidden={activeIndex !== index}
              aria-hidden={activeIndex !== index}
              className={styles.systemTabPanel}
            >
              <div className={styles.systemPanel}>
                {activeIndex === index ? (
                  <FiveKSystemPreview
                    kind={kind}
                    lang={lang}
                    label={module.title}
                    planSlug={slug}
                  />
                ) : null}
                <div className={styles.systemPanelFooter}>
                  <span>{module.points.join(" · ")}</span>
                  <TrackedLink
                    href={href}
                    eventName="plan_product_module_click"
                    eventProperties={{
                      slug,
                      module: module.name,
                      placement: "system_flow",
                    }}
                    className={styles.textLink}
                  >
                    {module.cta ?? calendarLabel}
                    <ArrowRight aria-hidden="true" />
                  </TrackedLink>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
