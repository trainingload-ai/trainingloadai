"use client";

import dynamic from "next/dynamic";

import { usePcViewport } from "@/hooks/use-mobile";
import { MePageSkeleton } from "./me-page-skeleton";

const MeMobileDashboard = dynamic(() =>
  import("./MeMobileDashboard").then((module) => module.MeMobileDashboard),
);
const MeDesktopDashboard = dynamic(() =>
  import("./MeDesktopDashboard").then((module) => module.MeDesktopDashboard),
);

function MePageLoading() {
  return <MePageSkeleton />;
}

export default function MePage() {
  const isPc = usePcViewport();

  if (isPc === undefined) return <MePageLoading />;
  return isPc ? <MeDesktopDashboard /> : <MeMobileDashboard />;
}
