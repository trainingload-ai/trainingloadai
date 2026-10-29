import {
  RUNTIME_CAPABILITY_NAMES,
  SELF_HOST_MODES,
  type RuntimeCapability,
  type RuntimeCapabilityName,
  type RuntimeCapabilitySnapshot,
  type RuntimeCapabilityState,
  type RuntimeMapConfiguration,
  type RuntimeMapProvider,
  type SelfHostMode,
} from './runtime-capability.types';
import { validateSelfHostNetworkSecurity } from '@/bootstrap/self-host-network-security';
import { isPublicSignupEnabled } from '@/auth/signup-policy';
import { applyDeploymentRuntimeCapabilityExtension } from './deployment-runtime-capability-extension.port';

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const OPENFREEMAP_ATTRIBUTION = '© OpenMapTiles © OpenStreetMap contributors';

function value(env: NodeJS.ProcessEnv, key: string): string {
  return env[key]?.trim() ?? '';
}

function enabled(env: NodeJS.ProcessEnv, key: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value(env, key).toLowerCase());
}

function missing(env: NodeJS.ProcessEnv, keys: readonly string[]): string[] {
  return keys.filter((key) => !value(env, key));
}

function capability(args: {
  name: RuntimeCapabilityName;
  required?: boolean;
  state: RuntimeCapabilityState;
  provider: string;
  issues?: string[];
}): RuntimeCapability {
  const code = {
    enabled: 'SELF_HOST_CAPABILITY_ENABLED',
    disabled: 'SELF_HOST_CAPABILITY_DISABLED',
    not_configured: 'SELF_HOST_CAPABILITY_NOT_CONFIGURED',
    misconfigured: 'SELF_HOST_CAPABILITY_MISCONFIGURED',
  } as const;
  return {
    name: args.name,
    required: args.required ?? false,
    state: args.state,
    provider: args.provider,
    code: code[args.state],
    issues: args.issues ?? [],
  };
}

function configuredCapability(args: {
  env: NodeJS.ProcessEnv;
  name: RuntimeCapabilityName;
  provider: string;
  requiredKeys: readonly string[];
}): RuntimeCapability {
  const missingKeys = missing(args.env, args.requiredKeys);
  return capability({
    name: args.name,
    provider: args.provider,
    state: missingKeys.length === 0 ? 'enabled' : 'misconfigured',
    issues: missingKeys.map((key) => `${key} is required`),
  });
}

export function isSelfHostEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(value(env, 'SELF_HOST_MODE'));
}

function aiCapability(
  env: NodeJS.ProcessEnv,
  selfHost: boolean,
): RuntimeCapability {
  let provider = value(env, 'AI_PROVIDER').toLowerCase();
  if (!provider && !selfHost) {
    provider = value(env, 'AI_COACH_PROVIDER').toLowerCase();
    if (!provider && value(env, 'OPENAI_API_KEY')) provider = 'openai';
    if (!provider && value(env, 'OPENROUTER_API_KEY')) provider = 'openrouter';
    if (!provider && value(env, 'DASHSCOPE_API_KEY')) provider = 'dashscope';
    if (!provider && value(env, 'DEEPSEEK_API_KEY')) provider = 'deepseek';
  }
  if (!provider || provider === 'none') {
    return capability({
      name: 'ai',
      provider: 'none',
      state: selfHost ? 'disabled' : 'not_configured',
    });
  }
  const requirements: Record<string, readonly string[]> = {
    openai: [
      'OPENAI_API_KEY',
      'OPENAI_DEFAULT_MODEL',
      'OPENAI_REASONING_MODEL',
    ],
    openrouter: [
      'OPENROUTER_API_KEY',
      'OPENROUTER_DEFAULT_MODEL',
      'OPENROUTER_REASONING_MODEL',
    ],
    dashscope: [
      'DASHSCOPE_API_KEY',
      'DASHSCOPE_DEFAULT_MODEL',
      'DASHSCOPE_REASONING_MODEL',
    ],
    aliyun: [
      'DASHSCOPE_API_KEY',
      'DASHSCOPE_DEFAULT_MODEL',
      'DASHSCOPE_REASONING_MODEL',
    ],
    deepseek: [
      'DEEPSEEK_API_KEY',
      'DEEPSEEK_DEFAULT_MODEL',
      'DEEPSEEK_REASONING_MODEL',
    ],
    gemini: [
      'AI_API_KEY',
      'AI_BASE_URL',
      'AI_DEFAULT_MODEL',
      'AI_REASONING_MODEL',
    ],
    xai: [
      'AI_API_KEY',
      'AI_BASE_URL',
      'AI_DEFAULT_MODEL',
      'AI_REASONING_MODEL',
    ],
    ollama: ['AI_BASE_URL', 'AI_DEFAULT_MODEL', 'AI_REASONING_MODEL'],
    'custom-openai-compatible': [
      'AI_BASE_URL',
      'AI_DEFAULT_MODEL',
      'AI_REASONING_MODEL',
    ],
  };
  const requiredKeys = requirements[provider];
  if (!requiredKeys) {
    return capability({
      name: 'ai',
      provider,
      state: 'misconfigured',
      issues: [`Unsupported AI_PROVIDER: ${provider}`],
    });
  }
  const normalizedEnv = { ...env };
  const legacyPrefixes: Record<string, string> = {
    openrouter: 'OPENROUTER',
    dashscope: 'DASHSCOPE',
    aliyun: 'DASHSCOPE',
    deepseek: 'DEEPSEEK',
  };
  const legacyPrefix = legacyPrefixes[provider];
  if (legacyPrefix) {
    const defaultKey = `${legacyPrefix}_DEFAULT_MODEL`;
    const reasoningKey = `${legacyPrefix}_REASONING_MODEL`;
    normalizedEnv[defaultKey] ||= value(env, `${legacyPrefix}_FLASH_MODEL`);
    normalizedEnv[reasoningKey] ||= value(env, `${legacyPrefix}_PRO_MODEL`);
  }
  return configuredCapability({
    env: normalizedEnv,
    name: 'ai',
    provider,
    requiredKeys,
  });
}

function storageCapability(
  env: NodeJS.ProcessEnv,
  selfHost: boolean,
): RuntimeCapability {
  if (!selfHost) {
    return capability({
      name: 'storage',
      provider: 'managed',
      required: true,
      state: 'enabled',
    });
  }

  const provider = (value(env, 'STORAGE_STRATEGY') || 'LOCAL').toUpperCase();
  if (provider === 'LOCAL') {
    return capability({
      name: 'storage',
      provider,
      required: true,
      state: 'enabled',
    });
  }
  return capability({
    name: 'storage',
    provider,
    required: true,
    state: 'misconfigured',
    issues: ['Self-host storage requires STORAGE_STRATEGY=LOCAL'],
  });
}

function maxZoom(env: NodeJS.ProcessEnv): number {
  const raw = value(env, 'MAP_MAX_ZOOM');
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 24 ? parsed : 18;
}

function mapCapability(
  env: NodeJS.ProcessEnv,
  selfHost: boolean,
): {
  capability: RuntimeCapability;
  config: RuntimeMapConfiguration;
} {
  const rawProvider = (
    value(env, 'MAP_PROVIDER') ||
    (!selfHost &&
    (value(env, 'MAP_PUBLIC_TOKEN') ||
      value(env, 'NEXT_PUBLIC_MAPBOX_TOKEN') ||
      value(env, 'MAPBOX_ACCESS_TOKEN'))
      ? 'mapbox'
      : 'none')
  ).toLowerCase();
  const providers: readonly RuntimeMapProvider[] = [
    'none',
    'openfreemap',
    'osm-raster',
    'custom-raster',
    'custom-style',
    'local',
    'mapbox',
  ];
  const provider = providers.includes(rawProvider as RuntimeMapProvider) && !(selfHost && rawProvider === 'mapbox')
    ? (rawProvider as RuntimeMapProvider)
    : 'invalid';
  const configuredStyleUrl = value(env, 'MAP_STYLE_URL') || null;
  const configuredTileUrl = value(env, 'MAP_TILE_URL') || null;
  const configuredAttribution = value(env, 'MAP_ATTRIBUTION') || null;
  const mapboxAccessToken = value(env, 'MAPBOX_ACCESS_TOKEN');
  const publicToken =
    value(env, 'MAP_PUBLIC_TOKEN') ||
    value(env, 'NEXT_PUBLIC_MAPBOX_TOKEN') ||
    (mapboxAccessToken.startsWith('pk.') ? mapboxAccessToken : '') ||
    null;
  const config: RuntimeMapConfiguration = {
    provider,
    styleUrl:
      provider === 'openfreemap' ? OPENFREEMAP_STYLE_URL : configuredStyleUrl,
    tileUrl: provider === 'osm-raster' ? OSM_TILE_URL : configuredTileUrl,
    attribution:
      provider === 'openfreemap'
        ? OPENFREEMAP_ATTRIBUTION
        : provider === 'osm-raster'
          ? OSM_ATTRIBUTION
          : configuredAttribution,
    maxZoom: maxZoom(env),
    publicToken: provider === 'mapbox' ? publicToken : null,
    tilePolicy: {
      browserOnly: ['openfreemap', 'osm-raster'].includes(provider),
      bulkDownloadAllowed: false,
    },
  };

  if (provider === 'none') {
    return {
      capability: capability({
        name: 'maps',
        provider,
        state: 'disabled',
      }),
      config,
    };
  }
  if (provider === 'invalid') {
    return {
      capability: capability({
        name: 'maps',
        provider: rawProvider,
        state: 'misconfigured',
        issues: [`Unsupported MAP_PROVIDER: ${rawProvider}`],
      }),
      config,
    };
  }

  const issues: string[] = [];
  if (provider === 'custom-raster') {
    if (!configuredTileUrl) issues.push('MAP_TILE_URL is required');
    if (!configuredAttribution) issues.push('MAP_ATTRIBUTION is required');
  }
  if (provider === 'custom-style') {
    if (!configuredStyleUrl) issues.push('MAP_STYLE_URL is required');
    if (!configuredAttribution) issues.push('MAP_ATTRIBUTION is required');
  }
  if (provider === 'local') {
    if (!configuredStyleUrl && !configuredTileUrl) {
      issues.push('MAP_STYLE_URL or MAP_TILE_URL is required');
    }
    if (!configuredAttribution) issues.push('MAP_ATTRIBUTION is required');
  }
  if (provider === 'mapbox' && !publicToken) {
    issues.push(
      'MAP_PUBLIC_TOKEN is required (or MAPBOX_ACCESS_TOKEN must be a public pk.* token)',
    );
  }

  return {
    capability: capability({
      name: 'maps',
      provider,
      state: issues.length ? 'misconfigured' : 'enabled',
      issues,
    }),
    config,
  };
}

function modeFromEnvironment(env: NodeJS.ProcessEnv): {
  deployment: 'self-host' | 'managed';
  mode: SelfHostMode | 'managed' | 'invalid';
} {
  const raw = value(env, 'SELF_HOST_MODE');
  if (!raw) return { deployment: 'managed', mode: 'managed' };
  if ((SELF_HOST_MODES as readonly string[]).includes(raw)) {
    return { deployment: 'self-host', mode: raw as SelfHostMode };
  }
  return { deployment: 'self-host', mode: 'invalid' };
}

export function resolveRuntimeCapabilities(
  env: NodeJS.ProcessEnv,
): RuntimeCapabilitySnapshot {
  const { deployment, mode } = modeFromEnvironment(env);
  const selfHost = deployment === 'self-host';
  const databaseIssues = missing(env, ['DATABASE_URL']).map(
    (key) => `${key} is required`,
  );
  const authIssues = missing(env, ['BETTER_AUTH_SECRET']).map(
    (key) => `${key} is required`,
  );
  if (
    value(env, 'BETTER_AUTH_SECRET') &&
    value(env, 'BETTER_AUTH_SECRET').length < 32
  ) {
    authIssues.push('BETTER_AUTH_SECRET must contain at least 32 characters');
  }

  const mailProvider = selfHost
    ? 'none'
    : value(env, 'MAIL_HOST')
      ? 'smtp'
      : 'none';
  const billingRequested =
    (value(env, 'BILLING_PROVIDER') || 'none').toLowerCase() !== 'none';
  const telemetryRequested = enabled(env, 'TELEMETRY_ENABLED');

  const capabilities = Object.fromEntries(
    RUNTIME_CAPABILITY_NAMES.map((name) => [
      name,
      capability({ name, provider: 'none', state: 'not_configured' }),
    ]),
  ) as Record<RuntimeCapabilityName, RuntimeCapability>;

  capabilities.database = capability({
    name: 'database',
    provider: 'postgresql',
    required: true,
    state: databaseIssues.length ? 'misconfigured' : 'enabled',
    issues: databaseIssues,
  });
  capabilities.storage = storageCapability(env, selfHost);
  capabilities.authentication = capability({
    name: 'authentication',
    provider: 'local',
    required: true,
    state: authIssues.length ? 'misconfigured' : 'enabled',
    issues: authIssues,
  });
  capabilities.ai = aiCapability(env, selfHost);
  capabilities.mail =
    mailProvider === 'none'
      ? capability({
          name: 'mail',
          provider: 'none',
          state: selfHost ? 'disabled' : 'not_configured',
        })
      : mailProvider === 'smtp'
        ? configuredCapability({
            env,
            name: 'mail',
            provider: 'smtp',
            requiredKeys: [
              'MAIL_HOST',
              'MAIL_PORT',
              'MAIL_USER',
              'MAIL_PASSWORD',
            ],
          })
        : capability({
            name: 'mail',
            provider: mailProvider,
            state: 'misconfigured',
            issues: [`Unsupported MAIL_PROVIDER: ${mailProvider}`],
          });
  capabilities.billing = selfHost
    ? capability({
        name: 'billing',
        provider: billingRequested ? 'external' : 'none',
        state: billingRequested ? 'misconfigured' : 'disabled',
        issues: billingRequested
          ? ['Billing is not part of the self-host runtime']
          : [],
      })
    : capability({
        name: 'billing',
        provider: 'managed',
        state: 'enabled',
      });
  capabilities.telemetry = selfHost
    ? capability({
        name: 'telemetry',
        provider: telemetryRequested ? 'external' : 'none',
        state: telemetryRequested ? 'misconfigured' : 'disabled',
        issues: telemetryRequested
          ? ['Telemetry is not part of the self-host runtime']
          : [],
      })
    : capability({
        name: 'telemetry',
        provider: 'managed',
        state: 'enabled',
      });

  const weatherRequested =
    enabled(env, 'ACTIVITY_WEATHER_ENABLED') ||
    enabled(env, 'AI_TODAY_WEATHER_ENABLED');
  capabilities.weather = selfHost
    ? capability({
        name: 'weather',
        provider: weatherRequested ? 'external' : 'none',
        state: weatherRequested ? 'misconfigured' : 'disabled',
        issues: weatherRequested
          ? ['Weather integrations are not part of the self-host runtime']
          : [],
      })
    : capability({
        name: 'weather',
        provider: weatherRequested ? 'managed' : 'none',
        state: weatherRequested ? 'enabled' : 'not_configured',
      });

  const maps = mapCapability(env, selfHost);
  capabilities.maps = maps.capability;
  const elevationProvider = (
    value(env, 'ELEVATION_PROVIDER') ||
    (!selfHost && value(env, 'MAPBOX_ACCESS_TOKEN') ? 'mapbox' : 'none')
  ).toLowerCase();
  capabilities.elevation =
    elevationProvider === 'none'
      ? capability({
          name: 'elevation',
          provider: 'none',
          state: 'disabled',
        })
      : elevationProvider === 'mapbox'
        ? configuredCapability({
            env,
            name: 'elevation',
            provider: 'mapbox',
            requiredKeys: ['MAPBOX_ACCESS_TOKEN'],
          })
        : elevationProvider === 'local-dem'
          ? capability({
              name: 'elevation',
              provider: 'local-dem',
              state: 'enabled',
            })
          : capability({
              name: 'elevation',
              provider: elevationProvider,
              state: 'misconfigured',
              issues: [`Unsupported ELEVATION_PROVIDER: ${elevationProvider}`],
            });
  capabilities['third-party-sync'] = capability({
    name: 'third-party-sync',
    provider: 'per-provider',
    state:
      !selfHost || enabled(env, 'THIRD_PARTY_SYNC_ENABLED')
        ? 'enabled'
        : 'disabled',
  });
  capabilities['intervals-icu-api-key'] = configuredCapability({
    env,
    name: 'intervals-icu-api-key',
    provider: 'personal-api-key',
    requiredKeys: ['EXTERNAL_PROVIDER_CREDENTIAL_SECRET'],
  });
  capabilities['intervals-icu-api-key'].required = selfHost;
  if (
    value(env, 'EXTERNAL_PROVIDER_CREDENTIAL_SECRET') &&
    value(env, 'EXTERNAL_PROVIDER_CREDENTIAL_SECRET').length < 32
  ) {
    capabilities['intervals-icu-api-key'].state = 'misconfigured';
    capabilities['intervals-icu-api-key'].code =
      'SELF_HOST_CAPABILITY_MISCONFIGURED';
    capabilities['intervals-icu-api-key'].issues = [
      'EXTERNAL_PROVIDER_CREDENTIAL_SECRET must contain at least 32 characters',
    ];
  }
  capabilities['agent-api'] = capability({
    name: 'agent-api',
    provider: 'builtin',
    state:
      !selfHost || enabled(env, 'AGENT_CAPABILITIES_ENABLED')
        ? 'enabled'
        : 'disabled',
  });
  const publicDemoEnabled = enabled(env, 'PUBLIC_DEMO_ENABLED');
  const publicDemoSecret = value(env, 'PUBLIC_DEMO_ACCESS_SECRET');
  capabilities['public-demo'] = publicDemoEnabled
    ? capability({
        name: 'public-demo',
        provider: 'builtin',
        state: publicDemoSecret.length >= 32 ? 'enabled' : 'misconfigured',
        issues:
          publicDemoSecret.length >= 32
            ? []
            : ['PUBLIC_DEMO_ACCESS_SECRET must contain at least 32 characters'],
      })
    : capability({
        name: 'public-demo',
        provider: 'none',
        state: 'disabled',
      });

  const authenticationMethods = {
    emailPassword: !selfHost,
    registration: {
      enabled: isPublicSignupEnabled(env),
      requiresEmailVerification: !selfHost,
    },
    emailVerification: capabilities.mail.state === 'enabled',
    passwordReset: capabilities.mail.state === 'enabled',
    social: {},
  };

  const networkSecurity = validateSelfHostNetworkSecurity(env);
  const startupErrors = [
    ...(mode === 'invalid'
      ? [`SELF_HOST_MODE must be one of: ${SELF_HOST_MODES.join(', ')}`]
      : []),
    ...(value(env, 'DISABLE_SIGNUP') &&
    !['true', 'false'].includes(value(env, 'DISABLE_SIGNUP').toLowerCase())
      ? ['DISABLE_SIGNUP must be true or false']
      : []),
    ...Object.values(capabilities)
      .filter((item) => item.required && item.state === 'misconfigured')
      .flatMap((item) => item.issues),
    ...networkSecurity.errors,
  ];
  if (mode === 'core-local') {
    const thumbnailProvider = (
      value(env, 'ACTIVITY_MAP_THUMB_PROVIDER') || 'local'
    ).toLowerCase();
    if (thumbnailProvider !== 'local') {
      startupErrors.push(
        'ACTIVITY_MAP_THUMB_PROVIDER must be local when SELF_HOST_MODE=core-local',
      );
    }
    if (enabled(env, 'SOCIAL_AUTH_ENABLED')) {
      startupErrors.push(
        'SOCIAL_AUTH_ENABLED must be false when SELF_HOST_MODE=core-local',
      );
    }
    for (const item of Object.values(capabilities)) {
      if (
        [
          'mail',
          'billing',
          'telemetry',
          'weather',
          'third-party-sync',
          'agent-api',
          'public-demo',
        ].includes(item.name) &&
        (['third-party-sync', 'agent-api'].includes(item.name)
          ? item.state === 'enabled'
          : item.provider !== 'none' || item.state === 'misconfigured')
      ) {
        startupErrors.push(
          `${item.name} must be disabled when SELF_HOST_MODE=core-local`,
        );
      }
    }
    if (capabilities.storage.provider !== 'LOCAL') {
      startupErrors.push(
        'STORAGE_STRATEGY must be LOCAL when SELF_HOST_MODE=core-local',
      );
    }
    if (!['none', 'local'].includes(capabilities.maps.provider)) {
      startupErrors.push(
        'MAP_PROVIDER must be none or local when SELF_HOST_MODE=core-local',
      );
    }
    if (!['none', 'local-dem'].includes(capabilities.elevation.provider)) {
      startupErrors.push(
        'ELEVATION_PROVIDER must be none or local-dem when SELF_HOST_MODE=core-local',
      );
    }
  }

  return applyDeploymentRuntimeCapabilityExtension(
    {
      schemaVersion: 1,
      deployment,
      mode,
      ready: startupErrors.length === 0,
      startupErrors: [...new Set(startupErrors)],
      startupWarnings: [...new Set(networkSecurity.warnings)],
      map: maps.config,
      authenticationMethods,
      capabilities,
    },
    env,
  );
}
