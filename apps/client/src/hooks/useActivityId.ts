"use client";

import { useParams } from "next/navigation";

export const useActivityId = () => {
  const params = useParams();
  const raw = params?.activityId as unknown;
  const activityId =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
      ? raw[0]
      : null;

  return activityId;
};
