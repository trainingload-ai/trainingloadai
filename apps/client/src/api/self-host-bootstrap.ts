import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useRuntimeCapabilities } from "@/api/runtime-capabilities";

export type SelfHostBootstrapStatus = {
  schemaVersion: 1;
  state: "PENDING" | "READY";
  bootstrapRequired: boolean;
  accessMode: "local-owner" | "credentials";
  browserSetupAvailable: boolean;
  tokenExpiresAt: string | null;
  mailRecoveryAvailable: boolean;
};

export type BootstrapLocalOwnerResult = {
  schemaVersion: 1;
  state: "READY";
  accessMode: "local-owner";
  owner: { name: string };
  initializedAt: string;
};

export type SelfHostSessionPolicy = {
  schemaVersion: 1;
  accessMode: "local-owner" | "credentials";
  isOwner: boolean;
  canSignOut: boolean;
  canDeleteAccount: boolean;
};

export async function createLocalOwner(name: string) {
  return apiFetch<BootstrapLocalOwnerResult>(
    "/api/self-host/bootstrap/local-owner",
    {
      method: "POST",
      body: JSON.stringify({ name }),
      cache: "no-store",
      suppressErrorToast: true,
    },
  );
}

export async function openLocalOwnerSession(): Promise<void> {
  const response = await fetch("/api/proxy/auth/self-host/local-owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    throw new Error(
      body?.code || body?.message || "SELF_HOST_LOCAL_SESSION_FAILED",
    );
  }
}

export function useSelfHostBootstrapStatus(enabled: boolean) {
  return useQuery({
    queryKey: ["self-host-bootstrap-status"],
    queryFn: () =>
      apiFetch<SelfHostBootstrapStatus>("/api/self-host/bootstrap/status", {
        cache: "no-store",
        suppressErrorToast: true,
      }),
    enabled,
    staleTime: 15_000,
    retry: false,
    meta: { errorSurface: "silent" },
  });
}

function useSelfHostSessionPolicyStatus(enabled: boolean) {
  return useQuery({
    queryKey: ["self-host-session-policy"],
    queryFn: () =>
      apiFetch<SelfHostSessionPolicy>("/api/self-host/session/policy", {
        cache: "no-store",
        suppressErrorToast: true,
      }),
    enabled,
    staleTime: 15_000,
    retry: false,
    meta: { errorSurface: "silent" },
  });
}

/**
 * Local-owner sessions are restored automatically for trusted loopback
 * requests. Exposing sign-out or account deletion in that mode would offer
 * actions that either immediately undo themselves or orphan the instance.
 *
 * Fail closed for a self-host build while session policy is loading so the
 * unavailable actions never flash on screen.
 */
export function useSelfHostSessionPolicy() {
  const runtimeCapabilities = useRuntimeCapabilities();
  const isSelfHost =
    runtimeCapabilities.data?.deployment === "self-host" ||
    Boolean(process.env.NEXT_PUBLIC_SELF_HOST_MODE);
  const sessionPolicy = useSelfHostSessionPolicyStatus(isSelfHost);
  const usesLocalOwnerAccess =
    isSelfHost && sessionPolicy.data?.accessMode !== "credentials";

  return {
    isSelfHost,
    accessMode: sessionPolicy.data?.accessMode,
    isOwner: isSelfHost && sessionPolicy.data?.isOwner === true,
    usesLocalOwnerAccess,
    canSignOut: !isSelfHost || sessionPolicy.data?.canSignOut === true,
    canDeleteAccount:
      !isSelfHost || sessionPolicy.data?.canDeleteAccount === true,
  };
}
