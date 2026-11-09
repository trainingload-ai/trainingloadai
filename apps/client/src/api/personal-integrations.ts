import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  PersonalProvider,
  PersonalConnectionStatus,
} from "@shared/personal-integrations";
export const personalPath = (provider: PersonalProvider) =>
  `/api/${provider === "garmin" ? "garmin-personal" : "coros-mcp"}`;
export async function personalRequest<T>(
  provider: PersonalProvider,
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await apiFetch<T>(`${personalPath(provider)}${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    suppressErrorToast: true,
  });
  if (response === undefined)
    throw new Error("PERSONAL_PROVIDER_EMPTY_RESPONSE");
  return response;
}
export function usePersonalConnection(
  provider: PersonalProvider,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["personal-connection", provider],
    queryFn: () =>
      personalRequest<PersonalConnectionStatus>(
        provider,
        "/status",
        undefined,
        "GET",
      ),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.jobs.some(
        (job) =>
          ["QUEUED", "RUNNING", "WAITING"].includes(job.status) ||
          (job.kind === "SYNC" && Number(job.result?.pending ?? 0) > 0) ||
          job.reconciling,
      )
        ? 5000
        : false,
  });
}
