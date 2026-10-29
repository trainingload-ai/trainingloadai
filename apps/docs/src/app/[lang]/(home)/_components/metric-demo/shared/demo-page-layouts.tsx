"use client";

import type { ReactNode } from "react";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";

import { DemoSubHeader } from "./demo-sub-header";
import type { DemoSportType, DemoTimeKey } from "./demo-types";

type LayoutProps = {
  children: ReactNode;
  sportType: DemoSportType;
  sportOptions: Array<{ value: DemoSportType; label: string }>;
  onSportChange: (value: DemoSportType) => void;
  times: DemoTimeKey[];
  timeOptions: Array<{ key: DemoTimeKey; label: string }>;
  onToggleTime: (key: DemoTimeKey) => void;
  allowAll?: boolean;
  activeTab?: string;
  multiple?: boolean;
};

function DemoMetricPageLayout({
  children,
  tabs,
  ...filterProps
}: LayoutProps & {
  tabs: Array<{ value: string; label: string }>;
}) {
  const multiple =
    filterProps.multiple ??
    (!filterProps.activeTab ||
      filterProps.activeTab === "curve" ||
      filterProps.activeTab === "zones");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col justify-between gap-2 rounded-compact bg-neutral-100 p-2 dark:bg-muted/45 md:flex-row md:items-center">
        <TabsList className="no-scrollbar h-auto w-full justify-start overflow-x-auto bg-neutral-100 dark:bg-muted/45 md:w-auto md:overflow-visible">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="min-w-20 flex-none md:flex-1"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="hidden md:block [&>div>div]:mb-0">
          <DemoSubHeader {...filterProps} multiple={multiple} />
        </div>
      </div>
      <div className="block md:hidden">
        <div className="rounded-compact bg-neutral-100 p-2 dark:bg-muted/45 [&>div>div]:mb-0">
          <DemoSubHeader {...filterProps} multiple={multiple} />
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export function DemoPowerPageLayout(
  props: LayoutProps & {
    tabs: Array<{ value: string; label: string }>;
  },
) {
  return <DemoMetricPageLayout {...props} />;
}

export function DemoPacePageLayout(
  props: LayoutProps & {
    tabs: Array<{ value: string; label: string }>;
  },
) {
  return <DemoMetricPageLayout {...props} allowAll={false} />;
}

export function DemoHeartRatePageLayout(
  props: LayoutProps & {
    tabs: Array<{ value: string; label: string }>;
  },
) {
  return <DemoMetricPageLayout {...props} />;
}
