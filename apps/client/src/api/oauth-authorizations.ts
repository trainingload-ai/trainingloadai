import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export type OAuthAuthorization = {
  clientId: string;
  clientName: string;
  clientUri: string | null;
  icon: string | null;
  scopes: string[];
  authorizedAt: string;
  updatedAt: string;
  isMcpClient: boolean;
  lastMcpUsedAt: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  active: boolean;
  renewable: boolean;
};

type OAuthAuthorizationsResponse = {
  authorizations: OAuthAuthorization[];
};

export function useOAuthAuthorizations() {
  return useQuery({
    queryKey: queryKeys.account.oauthAuthorizations(),
    queryFn: async () => {
      const data = await apiFetch<OAuthAuthorizationsResponse>(
        "/users/oauth-authorizations",
      );
      return data?.authorizations ?? [];
    },
  });
}

export function useRevokeOAuthAuthorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string) => {
      const result = await apiFetch<{ revoked: true }>(
        `/users/oauth-authorizations/${encodeURIComponent(clientId)}`,
        { method: "DELETE" },
      );
      if (!result?.revoked)
        throw new Error("OAuth authorization was not revoked");
      return clientId;
    },
    onSuccess: (clientId) => {
      queryClient.setQueryData<OAuthAuthorization[]>(
        queryKeys.account.oauthAuthorizations(),
        (current) =>
          (current ?? []).filter((item) => item.clientId !== clientId),
      );
    },
  });
}
