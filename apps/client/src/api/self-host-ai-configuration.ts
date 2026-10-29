import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { SelfHostAiProvider } from "@shared/self-host-ai-catalog";

export type { SelfHostAiProvider } from "@shared/self-host-ai-catalog";

export type SelfHostAiConfiguration = {
  source: "environment" | "owner";
  provider: SelfHostAiProvider;
  baseUrl: string | null;
  defaultModel: string | null;
  defaultModelContextTokens: number | null;
  reasoningModel: string | null;
  reasoningModelContextTokens: number | null;
  webSearchEnabled: boolean;
  apiKeyConfigured: boolean;
  updatedAt: string | null;
};

export type UpdateSelfHostAiConfiguration = {
  provider: SelfHostAiProvider;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  defaultModelContextTokens?: number;
  reasoningModel?: string;
  reasoningModelContextTokens?: number;
  webSearchEnabled?: boolean;
};

export function useSelfHostAiConfiguration(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.selfHost.aiConfiguration(),
    queryFn: () =>
      apiFetch<SelfHostAiConfiguration>("/api/self-host/settings/ai", {
        cache: "no-store",
        suppressErrorToast: true,
      }),
    enabled,
    retry: false,
    staleTime: 30_000,
    meta: { errorSurface: "silent" },
  });
}

export function useUpdateSelfHostAiConfiguration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSelfHostAiConfiguration) =>
      apiFetch<SelfHostAiConfiguration>("/api/self-host/settings/ai", {
        method: "PUT",
        body: JSON.stringify(input),
        suppressErrorToast: true,
      }),
    onSuccess: async (configuration) => {
      queryClient.setQueryData(
        queryKeys.selfHost.aiConfiguration(),
        configuration,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["runtime-capabilities"],
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.ai.entitlements(),
        }),
      ]);
    },
  });
}
