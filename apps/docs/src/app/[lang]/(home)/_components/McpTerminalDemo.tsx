"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleDot, LoaderCircle } from "lucide-react";
import { ProductBrowserChrome } from "@/components/ProductBrowserChrome";
import { cn } from "@/lib/utils";
import type { McpTerminalCopy } from "./mcp-terminal-copy";
import styles from "./mcp-terminal-demo.module.css";

const PROMPT_DURATION_MS = 1100;
const TOOL_DURATION_MS = 820;
const ANSWER_DURATION_MS = 3800;

export function McpTerminalDemo({
  copy,
  href,
  variant = "hero",
  className,
}: {
  copy: McpTerminalCopy;
  href?: string;
  variant?: "hero" | "compact";
  className?: string;
}) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [stage, setStage] = useState(0);
  const scenario = copy.scenarios[scenarioIndex] ?? copy.scenarios[0];
  const answerStage = scenario.calls.length + 1;
  const visualStage = prefersReducedMotion ? answerStage : stage;

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0.18 },
    );
    observer.observe(terminal);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMotionPreference = () => setPrefersReducedMotion(media.matches);
    handleMotionPreference();
    media.addEventListener("change", handleMotionPreference);
    return () => media.removeEventListener("change", handleMotionPreference);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState === "visible");
    };
    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!isInView || !isDocumentVisible || prefersReducedMotion) return;

    const duration =
      stage === 0
        ? PROMPT_DURATION_MS
        : stage >= answerStage
          ? ANSWER_DURATION_MS
          : TOOL_DURATION_MS;

    const timeout = window.setTimeout(() => {
      if (stage >= answerStage) {
        setStage(0);
        setScenarioIndex((current) => (current + 1) % copy.scenarios.length);
        return;
      }
      setStage((current) => current + 1);
    }, duration);

    return () => window.clearTimeout(timeout);
  }, [
    answerStage,
    copy.scenarios.length,
    isDocumentVisible,
    isInView,
    prefersReducedMotion,
    stage,
  ]);

  return (
    <div ref={terminalRef} className={className}>
      <p className="sr-only">{copy.accessibleSummary}</p>
      <div
        aria-hidden="true"
        data-mcp-scenario={scenarioIndex + 1}
        data-mcp-stage={visualStage}
        data-testid="mcp-terminal-demo"
        className="overflow-hidden rounded-control border border-white/15 bg-neutral-950 shadow-2xl shadow-black/40"
      >
        <ProductBrowserChrome
          address="trainingload.ai/mcp"
          addressHref={href}
          addressAriaLabel="TrainingLoad MCP"
          variant="dark"
          right={
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400 sm:text-[11px]">
              <span className="hidden text-neutral-600 md:inline">
                demo {String(scenarioIndex + 1).padStart(2, "0")} / {""}
                {String(copy.scenarios.length).padStart(2, "0")}
              </span>
              <CircleDot className="size-3" />
              <span className="hidden sm:inline">connected</span>
            </span>
          }
        />

        <div
          key={scenarioIndex}
          className={cn(
            "font-mono",
            variant === "compact" ? "p-4 sm:p-5" : "p-5 sm:p-7",
          )}
        >
          <div className="flex min-h-6 gap-3 text-sm font-semibold leading-6 text-white">
            <span className="text-emerald-400">›</span>
            <span className={cn("min-w-0", styles.typedPrompt)}>
              {scenario.question}
            </span>
            <span
              className={cn(
                "inline-block w-1.5 shrink-0 bg-emerald-400",
                styles.cursor,
              )}
            />
          </div>

          <div className={variant === "compact" ? "mt-4" : "mt-6"}>
            {scenario.calls.map(([name, detail], index) => {
              const callStage = index + 1;
              const isVisible = visualStage >= callStage;
              const isComplete = visualStage > callStage;
              return (
                <div
                  key={name}
                  className={cn(
                    "grid min-h-[3.25rem] gap-1 border-t border-white/10 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4",
                    styles.reveal,
                    isVisible && styles.visible,
                  )}
                >
                  <div className="flex items-center gap-2 font-mono text-[13px] font-semibold text-emerald-300">
                    <span className="grid size-3.5 shrink-0 place-items-center">
                      <LoaderCircle
                        className={cn(
                          "size-3 text-emerald-400",
                          styles.spinner,
                          isComplete && "hidden",
                        )}
                      />
                      <Check
                        className={cn(
                          "size-3 text-emerald-400",
                          styles.completedIcon,
                          !isComplete && "hidden",
                        )}
                      />
                    </span>
                    <span>{name}</span>
                  </div>
                  <div className="pl-5.5 text-xs leading-5 text-neutral-400 sm:pl-0">
                    {detail}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className={cn(
              "mt-5 min-h-[5.5rem] border-l-2 border-emerald-400 pl-4 text-sm leading-7 text-neutral-200",
              styles.reveal,
              visualStage >= answerStage && styles.visible,
            )}
          >
            {scenario.answer}
          </div>
        </div>
      </div>
    </div>
  );
}
