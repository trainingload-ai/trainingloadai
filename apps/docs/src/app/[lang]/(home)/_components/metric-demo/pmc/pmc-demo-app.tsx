"use client";

import { useMemo, useState } from "react";

import { resolveDemoCopy } from "@/lib/demo-i18n";

import { metricDemoCopy } from "../copy";
import { buildPmcSeries, DEMO_PMC_EXTREMES } from "../demo-fixtures";
import {
  DemoRecalculateButton,
  DemoSubHeader,
  useDemoFilters,
} from "../shared/demo-sub-header";
import { PmcDemoCharts } from "./pmc-demo-charts";
import { PmcDemoStat } from "./pmc-demo-stat";

export function PmcDemoApp({ lang }: { lang: string }) {
  const copy = resolveDemoCopy(metricDemoCopy, lang);
  const filters = useDemoFilters({ singleTime: "last90", sportType: "all" });
  const [selected, setSelected] = useState<"fitness" | "fatigue" | "form">(
    "fitness",
  );
  const data = useMemo(() => buildPmcSeries(), []);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-3 md:gap-4">
      <div className="mb-1 px-1">
        <div className="rounded-compact bg-neutral-100 px-2.5 py-2 dark:bg-muted/45">
          <DemoSubHeader
            sportType={filters.sportType}
            sportOptions={copy.sportOptions}
            onSportChange={filters.setSportType}
            times={[filters.singleTime]}
            timeOptions={copy.timeOptions}
            onToggleTime={() => undefined}
            multiple={false}
            singleTime={filters.singleTime}
            onSingleTimeChange={filters.setSingleTime}
            buttons={[
              <DemoRecalculateButton
                key="calc"
                label={copy.pmc.calculate}
                calculatingLabel={copy.pmc.calculating}
              />,
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 px-1 md:gap-4">
        <div className="rounded-compact bg-neutral-100 p-2 dark:bg-muted/45">
          <div className="grid gap-2 md:grid-cols-3 md:items-center">
            <PmcDemoStat
              copy={copy}
              type="fatigue"
              title={copy.pmc.fatigue.title}
              data={data}
              extremes={DEMO_PMC_EXTREMES}
              selected={selected}
              onSelect={setSelected}
            />
            <PmcDemoStat
              copy={copy}
              type="fitness"
              title={copy.pmc.fitness.title}
              data={data}
              extremes={DEMO_PMC_EXTREMES}
              selected={selected}
              onSelect={setSelected}
            />
            <PmcDemoStat
              copy={copy}
              type="form"
              title={copy.pmc.form.title}
              data={data}
              extremes={DEMO_PMC_EXTREMES}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
        </div>

        <PmcDemoCharts copy={copy} data={data} selected={selected} />
      </div>
    </div>
  );
}
