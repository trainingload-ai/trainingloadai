"use client";

import type { PaceZoneModel } from "@/api/settings";
import { UserZonePreviewTable } from "./UserZonePreviewTable";

export function UserPaceZoneTable(props: {
  sport: "RUN" | "SWIM";
  model: PaceZoneModel;
}) {
  return <UserZonePreviewTable {...props} zoneType="PACE" />;
}
