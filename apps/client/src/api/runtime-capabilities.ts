import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type RuntimeCapabilityName =
  | "database"
  | "storage"
  | "authentication"
  | "maps"
  | "elevation"
  | "mail"
  | "ai"
  | "billing"
  | "telemetry"
  | "weather"
  | "third-party-sync"
  | "intervals-icu-api-key"
  | "agent-api"
  | "public-demo";

export type RuntimeCapabilityState =
  | "enabled"
  | "disabled"
  | "not_configured"
  | "misconfigured";

export type RuntimeCapability = {
  name: RuntimeCapabilityName;
  required: boolean;
  state: RuntimeCapabilityState;
  provider: string;
  code: string;
  issues: string[];
};

export type RuntimeMapProvider =
  | "none"
  | "openfreemap"
  | "osm-raster"
  | "custom-raster"
  | "custom-style"
  | "local"
  | "mapbox"
  | "invalid";

export type RuntimeMapConfiguration = {
  provider: RuntimeMapProvider;
  styleUrl: string | null;
  tileUrl: string | null;
  attribution: string | null;
  maxZoom: number;
  publicToken: string | null;
  tilePolicy: {
    browserOnly: boolean;
    bulkDownloadAllowed: false;
  };
};

export type RuntimeCapabilitySnapshot = {
  schemaVersion: 1;
  deployment: "self-host" | "managed";
  edition?: "self-host" | "cloud";
  accountMode?: "single-owner" | "multi-user";
  singleOwner?: boolean;
  apiVersion?: 1;
  version?: string;
  mode: "core-local" | "connected" | "extended" | "managed" | "invalid";
  ready: boolean;
  startupErrors: string[];
  startupWarnings: string[];
  map: RuntimeMapConfiguration;
  authenticationMethods: {
    emailPassword: boolean;
    registration: {
      enabled: boolean;
      requiresEmailVerification: boolean;
    };
    emailVerification: boolean;
    passwordReset: boolean;
    social: Record<string, boolean>;
  };
  capabilities: Record<RuntimeCapabilityName, RuntimeCapability>;
};

export function runtimeCapabilityAvailable(
  capability: RuntimeCapability | undefined,
): boolean {
  if (capability) return capability.state === "enabled";
  // Released self-host clients fail closed while the capability registry is
  // loading. Managed clients retain compatibility with older API servers.
  return !process.env.NEXT_PUBLIC_SELF_HOST_MODE;
}

export function useRuntimeCapabilities() {
  return useQuery({
    queryKey: ["runtime-capabilities"],
    queryFn: () =>
      apiFetch<RuntimeCapabilitySnapshot>("/api/runtime/capabilities", {
        cache: "no-store",
        suppressErrorToast: true,
        responseFormat: "raw-json",
      }),
    staleTime: 60_000,
    retry: false,
    meta: { errorSurface: "silent" },
  });
}

export function useRuntimeCapability(name: RuntimeCapabilityName) {
  return useRuntimeCapabilities().data?.capabilities[name];
}

const routeOnlyMap: RuntimeMapConfiguration = {
  provider: "none",
  styleUrl: null,
  tileUrl: null,
  attribution: null,
  maxZoom: 18,
  publicToken: null,
  tilePolicy: { browserOnly: false, bulkDownloadAllowed: false },
};

export function useRuntimeMapConfiguration(): {
  config: RuntimeMapConfiguration | undefined;
  isLoading: boolean;
} {
  const query = useRuntimeCapabilities();
  if (query.data) {
    const maps = query.data.capabilities.maps;
    return {
      config: maps.state === "enabled" ? query.data.map : routeOnlyMap,
      isLoading: false,
    };
  }
  if (query.isError || (query.isSuccess && !query.data)) {
    const legacyToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() || null;
    return {
      config: legacyToken
        ? {
            ...routeOnlyMap,
            provider: "mapbox",
            publicToken: legacyToken,
          }
        : routeOnlyMap,
      isLoading: false,
    };
  }
  return { config: undefined, isLoading: true };
}
