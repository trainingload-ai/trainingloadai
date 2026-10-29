import React from "react";
import uPlot from "uplot";
import UplotReact from "uplot-react";

const MemoUplotReact = React.memo(UplotReact);

export function MetricHistoryChartCanvas({
  chartAreaSize,
  isLoading,
  noDataLabel,
  options,
  setChartWrapperNode,
  tooltip,
  uplotData,
}: {
  chartAreaSize: { height: number; width: number };
  isLoading: boolean;
  noDataLabel: string;
  options: uPlot.Options;
  setChartWrapperNode: (node: HTMLDivElement | null) => void;
  tooltip: React.ReactNode;
  uplotData: uPlot.AlignedData;
}) {
  if (uplotData[0].length === 0) {
    if (isLoading) return null;
    return (
      <div className="min-h-[200px] h-full w-full flex items-center justify-center text-muted-foreground text-sm">
        {noDataLabel}
      </div>
    );
  }

  return (
    <div ref={setChartWrapperNode} className="h-full w-full relative" data-uplot-chart>
      {chartAreaSize.width > 0 && chartAreaSize.height > 0 ? (
        <MemoUplotReact options={options} data={uplotData} />
      ) : null}
      {tooltip}
    </div>
  );
}
