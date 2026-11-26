"use client";

import { useParams } from "next/navigation";
import { createContext, useContext } from "react";

export const ActivityDetailIdContext = createContext<string | null>(null);

export const useActivityId = () => {
  const detailId = useContext(ActivityDetailIdContext);
  const params = useParams();
  const raw = params?.activityId as unknown;
  const activityId =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
      ? raw[0]
      : null;

  return detailId ?? activityId;
};
