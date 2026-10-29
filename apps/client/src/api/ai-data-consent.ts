import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import { track } from "@/lib/analytics";
import { subscribeToAiDataConsentRequired } from "@/lib/ai-data-consent-events";
import { queryKeys } from "@/lib/query-keys";

export type AiDataConsentState =
  | "UNAVAILABLE"
  | "UNDECIDED"
  | "GRANTED"
  | "DECLINED"
  | "RECONSENT_REQUIRED";

export type AiDataConsentStatus = {
  state: AiDataConsentState;
  granted: boolean;
  promptRequired: boolean;
  required: boolean;
  version: string;
  provider:
    | "openai"
    | "openrouter"
    | "aliyun"
    | "deepseek"
    | "custom-openai-compatible"
    | null;
  recipient: string;
  decidedAt: string | null;
};

export type AiDataConsentSource =
  | "ONBOARDING"
  | "HOME_REMINDER"
  | "COACH"
  | "ACCOUNT_SETTINGS"
  | "REVIEW_AUTOMATION";

export function fetchAiDataConsentStatus(signal?: AbortSignal) {
  return apiFetch<AiDataConsentStatus>("/ai/data-consent", { signal });
}

export function useAiDataConsent(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.ai.dataConsent(),
    queryFn: ({ signal }) => fetchAiDataConsentStatus(signal),
    enabled: options?.enabled ?? true,
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(
    () =>
      subscribeToAiDataConsentRequired(() => {
        queryClient.setQueryData<AiDataConsentStatus>(
          queryKeys.ai.dataConsent(),
          (current) =>
            current
              ? {
                  ...current,
                  state: "RECONSENT_REQUIRED",
                  granted: false,
                  promptRequired: true,
                  required: true,
                }
              : current,
        );
        void queryClient.invalidateQueries({
          queryKey: queryKeys.ai.dataConsent(),
        });
      }),
    [queryClient],
  );

  return query;
}

export async function updateAiDataConsent(input: {
  granted: boolean;
  source: AiDataConsentSource;
  locale?: string;
}) {
  return (await apiFetch<AiDataConsentStatus>("/ai/data-consent", {
    method: "POST",
    body: JSON.stringify(input),
  }))!;
}

export function useUpdateAiDataConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateAiDataConsent,
    onSuccess: (status, variables) => {
      queryClient.setQueryData(queryKeys.ai.dataConsent(), status);
      void queryClient.invalidateQueries({
        queryKey: ["v2-home-today-advice"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["athlete-memory", "preference"],
      });
      track("ai_consent_decided", {
        granted: variables.granted,
        source: variables.source,
        version: status?.version,
        provider: status?.provider,
      });
    },
  });
}
