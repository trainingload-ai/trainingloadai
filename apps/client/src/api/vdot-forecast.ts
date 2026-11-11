import { useQuery } from "@tanstack/react-query";
import type { VdotForecastResult } from "@shared/vdot-forecast";
import { apiFetch } from "@/lib/api";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

export function useVdotForecast(enabled = true) {
  const { data: session } = useViewerSession();
  const demo = usePublicDemo();
  return useQuery({
    queryKey: ["pmc", "vdot-forecast", session?.user?.id],
    queryFn: () => apiFetch<VdotForecastResult>("/pmc/vdot-forecast"),
    enabled: enabled && Boolean(session?.user?.id) && !demo.active,
    staleTime: 60_000,
    retry: 1,
  });
}
