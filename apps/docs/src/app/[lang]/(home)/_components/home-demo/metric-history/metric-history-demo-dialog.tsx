"use client";

import { ArrowUpRight } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DemoIndexedCurveChart } from "../../metric-demo/shared/demo-indexed-curve-chart";

import { getMetricHistoryChartFixture } from "./demo-fixtures";
import type { MetricHistoryDialogState } from "./types";

const METRIC_HISTORY_DIALOG_Z = "z-[110]";

export function MetricHistoryDemoDialog({
  state,
  onOpenChange,
}: {
  state: MetricHistoryDialogState;
  onOpenChange: (open: boolean) => void;
}) {
  const chart = getMetricHistoryChartFixture(state.key);

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName={METRIC_HISTORY_DIALOG_Z}
        className={`${METRIC_HISTORY_DIALOG_Z} flex max-h-[85vh] w-[calc(100%-2rem)] max-w-[min(70vw,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(70vw,720px)] lg:max-w-[min(50vw,720px)]`}
        showCloseButton
      >
        <div className="flex min-h-0 flex-col p-4">
          <div className="flex flex-row gap-4">
            <div className="text-base font-semibold text-foreground">
              {state.title}
            </div>
            <div className="text-base font-bold text-primary">
              {state.currentValue}
              {state.unit ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {state.unit}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-6 py-4">
            <div className="w-full shrink-0">
              <DemoIndexedCurveChart
                title=""
                labels={chart.labels}
                series={chart.series}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-2">
              <div className="space-y-4 rounded-compact bg-neutral-100 p-4 text-sm text-muted-foreground dark:bg-muted/45">
                <h4 className="font-semibold text-foreground">{state.title}</h4>
                {state.description ? (
                  <p className="text-xs leading-relaxed">{state.description}</p>
                ) : null}

                {state.links.length > 0 ? (
                  <div className="mt-4 space-y-2 border-t border-border/50 pt-4">
                    {state.links.map((link) => (
                      <a
                        key={`${state.key}-${link.href}-${link.label}`}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-xs text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
                      >
                        <span className="inline-flex items-center gap-1">
                          {link.label}
                          <ArrowUpRight
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                        </span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
