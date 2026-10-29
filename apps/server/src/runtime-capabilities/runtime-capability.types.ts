export const SELF_HOST_MODES = ['core-local', 'connected', 'extended'] as const;

export type SelfHostMode = (typeof SELF_HOST_MODES)[number];

export const RUNTIME_CAPABILITY_NAMES = [
  'database',
  'storage',
  'authentication',
  'maps',
  'elevation',
  'mail',
  'ai',
  'billing',
  'telemetry',
  'weather',
  'third-party-sync',
  'intervals-icu-api-key',
  'agent-api',
  'public-demo',
] as const;

export type RuntimeCapabilityName = (typeof RUNTIME_CAPABILITY_NAMES)[number];

export type RuntimeCapabilityState =
  | 'enabled'
  | 'disabled'
  | 'not_configured'
  | 'misconfigured';

export type RuntimeCapability = {
  name: RuntimeCapabilityName;
  required: boolean;
  state: RuntimeCapabilityState;
  provider: string;
  code:
    | 'SELF_HOST_CAPABILITY_ENABLED'
    | 'SELF_HOST_CAPABILITY_DISABLED'
    | 'SELF_HOST_CAPABILITY_NOT_CONFIGURED'
    | 'SELF_HOST_CAPABILITY_MISCONFIGURED';
  issues: string[];
};

export type RuntimeMapProvider =
  | 'none'
  | 'openfreemap'
  | 'osm-raster'
  | 'custom-raster'
  | 'custom-style'
  | 'local'
  | 'mapbox';

export type RuntimeMapConfiguration = {
  provider: RuntimeMapProvider | 'invalid';
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
  deployment: 'self-host' | 'managed';
  edition?: 'self-host' | 'cloud';
  accountMode?: 'single-owner' | 'multi-user';
  singleOwner?: boolean;
  apiVersion?: 1;
  version?: string;
  mode: SelfHostMode | 'managed' | 'invalid';
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

/** Stable public name used by deployment composition and external clients. */
export type RuntimeCapabilities = RuntimeCapabilitySnapshot;
