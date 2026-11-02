import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiFetch, apiDownloadFetch } from "@/lib/api";
import type {
  SavedRouteDetail,
  SavedRouteSummary,
  RouteSportCode,
} from "@shared/routes";
export function useSavedRoutes() {
  return useInfiniteQuery({
    queryKey: ["saved-routes"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await apiFetch<{
        items: SavedRouteSummary[];
        nextCursor: string | null;
      }>(
        `/routes${pageParam ? "?cursor=" + encodeURIComponent(pageParam) : ""}`,
      ))!,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
export function useSavedRoute(id: string | null) {
  return useQuery({
    queryKey: ["saved-route", id],
    enabled: !!id,
    queryFn: async () =>
      (await apiFetch<SavedRouteDetail>(`/routes/${encodeURIComponent(id!)}`))!,
  });
}
export async function importSavedRoute(input: {
  name: string;
  description: string;
  sportCode: RouteSportCode;
  file: File;
  requestId: string;
  routeId?: string;
  expectedRevision?: number;
}) {
  const form = new FormData();
  form.set("file", input.file);
  form.set("name", input.name);
  form.set("description", input.description);
  form.set("sportCode", input.sportCode);
  if (input.routeId)
    form.set("expectedRevision", String(input.expectedRevision));
  else form.set("requestId", input.requestId);
  return (await apiFetch<SavedRouteDetail>(
    input.routeId
      ? `/routes/${encodeURIComponent(input.routeId)}/versions`
      : "/routes/import",
    { method: "POST", body: form, suppressErrorToast: true },
  ))!;
}
export async function removeSavedRoute(id: string, expectedRevision: number) {
  return apiFetch<{ deleted: boolean; pendingDeliveries: number }>(
    `/routes/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      body: JSON.stringify({ expectedRevision }),
      suppressErrorToast: true,
    },
  );
}
export async function downloadSavedRoute(id: string) {
  const result = await apiDownloadFetch(
    `/routes/${encodeURIComponent(id)}/original`,
  );
  if (!result) return;
  const url = URL.createObjectURL(result.blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
