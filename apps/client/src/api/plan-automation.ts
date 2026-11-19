import { apiFetch, ApiFetchError } from "@/lib/api";
import type { RollingPlanAutomationStatus } from "@shared/rolling-plan";

export async function getPlanAutomation(
  planId: string,
): Promise<RollingPlanAutomationStatus> {
  const result = await apiFetch<RollingPlanAutomationStatus>(
    `/plans/${encodeURIComponent(planId)}/automation`,
    { method: "GET", suppressErrorToast: true },
  );
  if (!result)
    throw new ApiFetchError(
      "Automatic plan state was not returned",
      502,
      "INVALID_RESPONSE",
      undefined,
      true,
    );
  return result;
}

export async function setPlanAutomationEnabled(
  planId: string,
  enabled: boolean,
) {
  const result = await apiFetch<{ enabled: boolean; revision: number }>(
    `/plans/${encodeURIComponent(planId)}/automation`,
    {
      method: "PUT",
      body: JSON.stringify({ enabled }),
      suppressErrorToast: true,
    },
  );
  if (!result)
    throw new ApiFetchError(
      "Automatic plan update was not acknowledged",
      502,
      "INVALID_RESPONSE",
      undefined,
      true,
    );
  return result;
}
