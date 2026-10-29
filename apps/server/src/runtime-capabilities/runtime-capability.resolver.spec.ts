import { describe, expect, it } from '@jest/globals';
import { resolveRuntimeCapabilities } from './runtime-capability.resolver';

function coreLocal(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    SELF_HOST_MODE: 'core-local',
    DATABASE_URL: 'postgresql://postgres:secret@postgres/app',
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    EXTERNAL_PROVIDER_CREDENTIAL_SECRET: 'b'.repeat(32),
    NEXT_PUBLIC_APP_URL: 'http://localhost',
    NEXT_PUBLIC_API_URL: 'http://localhost',
    TRUSTED_ORIGINS: 'http://localhost',
    SELF_HOST_HTTP_BIND: '127.0.0.1',
    SELF_HOST_GATEWAY_ADDRESS: 'http://:80',
    STORAGE_STRATEGY: 'LOCAL',
    AI_PROVIDER: 'none',
    MAIL_PROVIDER: 'none',
    BILLING_PROVIDER: 'none',
    TELEMETRY_ENABLED: 'false',
    THIRD_PARTY_SYNC_ENABLED: 'false',
    AGENT_CAPABILITIES_ENABLED: 'false',
    SOCIAL_AUTH_ENABLED: 'false',
    MAP_PROVIDER: 'none',
    ELEVATION_PROVIDER: 'none',
    ...overrides,
  };
}

describe('runtime capability resolver', () => {
  it('accepts Core Local without commercial credentials', () => {
    const snapshot = resolveRuntimeCapabilities(coreLocal());
    expect(snapshot).toMatchObject({
      deployment: 'self-host',
      mode: 'core-local',
      ready: true,
    });
    expect(snapshot.capabilities.database.state).toBe('enabled');
    expect(snapshot.capabilities.storage.state).toBe('enabled');
    expect(snapshot.capabilities.authentication.state).toBe('enabled');
    expect(snapshot.capabilities['agent-api'].state).toBe('disabled');
    expect(snapshot.capabilities['third-party-sync'].state).toBe('disabled');
    expect(snapshot.capabilities['intervals-icu-api-key']).toMatchObject({
      provider: 'personal-api-key',
      state: 'enabled',
    });
    expect(snapshot.authenticationMethods).toEqual({
      emailPassword: false,
      registration: {
        enabled: false,
        requiresEmailVerification: false,
      },
      emailVerification: false,
      passwordReset: false,
      social: {},
    });
    for (const name of [
      'ai',
      'mail',
      'billing',
      'telemetry',
      'weather',
      'public-demo',
    ] as const) {
      expect(snapshot.capabilities[name]).toMatchObject({
        state: 'disabled',
        issues: [],
      });
    }
  });

  it('reports required configuration with stable, secret-free issues', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({ DATABASE_URL: '', BETTER_AUTH_SECRET: 'short' }),
    );
    expect(snapshot.ready).toBe(false);
    expect(snapshot.startupErrors).toEqual(
      expect.arrayContaining([
        'DATABASE_URL is required',
        'BETTER_AUTH_SECRET must contain at least 32 characters',
      ]),
    );
    expect(JSON.stringify(snapshot)).not.toContain(
      'postgresql://postgres:secret',
    );
  });

  it('requires a dedicated self-host integration encryption secret', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({ EXTERNAL_PROVIDER_CREDENTIAL_SECRET: '' }),
    );

    expect(snapshot.ready).toBe(false);
    expect(snapshot.capabilities['intervals-icu-api-key']).toMatchObject({
      required: true,
      state: 'misconfigured',
      issues: ['EXTERNAL_PROVIDER_CREDENTIAL_SECRET is required'],
    });
    expect(snapshot.startupErrors).toContain(
      'EXTERNAL_PROVIDER_CREDENTIAL_SECRET is required',
    );
  });

  it('marks an incomplete optional provider without blocking core startup', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({
        SELF_HOST_MODE: 'extended',
        AI_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: 'secret',
      }),
    );
    expect(snapshot.ready).toBe(true);
    expect(snapshot.capabilities.ai).toMatchObject({
      provider: 'openrouter',
      state: 'misconfigured',
      issues: [
        'OPENROUTER_DEFAULT_MODEL is required',
        'OPENROUTER_REASONING_MODEL is required',
      ],
    });
    expect(JSON.stringify(snapshot)).not.toContain('secret');
  });

  it('allows an explicitly configured owner-funded AI provider in Core Local', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({
        AI_PROVIDER: 'deepseek',
        DEEPSEEK_API_KEY: 'secret',
        DEEPSEEK_DEFAULT_MODEL: 'default',
        DEEPSEEK_REASONING_MODEL: 'reasoning',
      }),
    );
    expect(snapshot.ready).toBe(true);
    expect(snapshot.capabilities.ai).toMatchObject({
      provider: 'deepseek',
      state: 'enabled',
    });
  });

  it('accepts legacy managed DeepSeek tier model variables', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({
        SELF_HOST_MODE: '',
        AI_PROVIDER: '',
        AI_COACH_PROVIDER: 'deepseek',
        DEEPSEEK_API_KEY: 'secret',
        DEEPSEEK_DEFAULT_MODEL: '',
        DEEPSEEK_REASONING_MODEL: '',
        DEEPSEEK_FLASH_MODEL: 'deepseek-flash',
        DEEPSEEK_PRO_MODEL: 'deepseek-v4-pro',
      }),
    );

    expect(snapshot.capabilities.ai).toMatchObject({
      provider: 'deepseek',
      state: 'enabled',
      issues: [],
    });
  });

  it('reports an incomplete AI provider without blocking Core Local startup', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({ AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'secret' }),
    );
    expect(snapshot.ready).toBe(true);
    expect(snapshot.capabilities.ai.state).toBe('misconfigured');
    expect(snapshot.startupErrors).not.toContain(
      'ai must be disabled when SELF_HOST_MODE=core-local',
    );
  });

  it('does not parse deployment-specific social providers', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({
        SELF_HOST_MODE: 'extended',
        MAIL_PROVIDER: 'smtp',
        MAIL_HOST: 'smtp.example.test',
        MAIL_PORT: '587',
        MAIL_USER: 'mailer',
        MAIL_PASSWORD: 'mailer-secret',
        SOCIAL_AUTH_ENABLED: 'true',
        OAUTH_GITHUB_CLIENT_ID: 'github-client',
        OAUTH_GITHUB_CLIENT_SECRET: 'github-secret',
        GOOGLE_CLIENT_ID: 'google-client-without-secret',
      }),
    );
    expect(snapshot.authenticationMethods).toEqual({
      emailPassword: false,
      registration: {
        enabled: false,
        requiresEmailVerification: false,
      },
      emailVerification: false,
      passwordReset: false,
      social: {},
    });
    expect(JSON.stringify(snapshot)).not.toContain('github-secret');
  });

  it('rejects remote map and elevation providers in Core Local', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({ MAP_PROVIDER: 'osm-raster', ELEVATION_PROVIDER: 'mapbox' }),
    );
    expect(snapshot.ready).toBe(false);
    expect(snapshot.startupErrors).toEqual(
      expect.arrayContaining([
        'MAP_PROVIDER must be none or local when SELF_HOST_MODE=core-local',
        'ELEVATION_PROVIDER must be none or local-dem when SELF_HOST_MODE=core-local',
      ]),
    );
  });

  it('rejects remote thumbnail rendering in Core Local', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({ ACTIVITY_MAP_THUMB_PROVIDER: 'mapbox' }),
    );

    expect(snapshot.ready).toBe(false);
    expect(snapshot.startupErrors).toContain(
      'ACTIVITY_MAP_THUMB_PROVIDER must be local when SELF_HOST_MODE=core-local',
    );
  });

  it('publishes a policy-safe OSM browser configuration', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({
        SELF_HOST_MODE: 'connected',
        MAP_PROVIDER: 'osm-raster',
        MAP_TILE_URL: 'https://operator.example/ignored/{z}/{x}/{y}.png',
        MAP_ATTRIBUTION: 'incorrect override',
      }),
    );

    expect(snapshot.capabilities.maps.state).toBe('enabled');
    expect(snapshot.map).toEqual({
      provider: 'osm-raster',
      styleUrl: null,
      tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
      publicToken: null,
      tilePolicy: {
        browserOnly: true,
        bulkDownloadAllowed: false,
      },
    });
  });

  it('publishes the fixed OpenFreeMap vector style without credentials', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({
        SELF_HOST_MODE: 'connected',
        MAP_PROVIDER: 'openfreemap',
        MAP_STYLE_URL: 'https://operator.example/ignored-style.json',
        MAP_ATTRIBUTION: 'incorrect override',
      }),
    );

    expect(snapshot.capabilities.maps.state).toBe('enabled');
    expect(snapshot.map).toEqual({
      provider: 'openfreemap',
      styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
      tileUrl: null,
      attribution: '© OpenMapTiles © OpenStreetMap contributors',
      maxZoom: 18,
      publicToken: null,
      tilePolicy: {
        browserOnly: true,
        bulkDownloadAllowed: false,
      },
    });
  });

  it('requires explicit attribution for custom raster tiles', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({
        SELF_HOST_MODE: 'extended',
        MAP_PROVIDER: 'custom-raster',
        MAP_TILE_URL: 'https://tiles.example/{z}/{x}/{y}.png',
      }),
    );

    expect(snapshot.capabilities.maps).toMatchObject({
      state: 'misconfigured',
      issues: ['MAP_ATTRIBUTION is required'],
    });
  });

  it('requires explicit attribution for custom and local styles', () => {
    for (const provider of ['custom-style', 'local']) {
      const snapshot = resolveRuntimeCapabilities(
        coreLocal({
          SELF_HOST_MODE: 'extended',
          MAP_PROVIDER: provider,
          MAP_STYLE_URL: 'https://maps.example/style.json',
        }),
      );

      expect(snapshot.capabilities.maps).toMatchObject({
        state: 'misconfigured',
        issues: ['MAP_ATTRIBUTION is required'],
      });
    }
  });

  it('never exposes a private Mapbox access token', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({
        SELF_HOST_MODE: 'extended',
        MAP_PROVIDER: 'mapbox',
        MAPBOX_ACCESS_TOKEN: 'sk.private-server-token',
      }),
    );

    expect(snapshot.capabilities.maps.state).toBe('misconfigured');
    expect(snapshot.map.publicToken).toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain('sk.private-server-token');
  });

  it('rejects cloud storage strategies in the self-host runtime', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({
        SELF_HOST_MODE: 'extended',
        STORAGE_STRATEGY: 'R2',
      }),
    );
    expect(snapshot.ready).toBe(false);
    expect(snapshot.capabilities.storage.state).toBe('misconfigured');
    expect(snapshot.startupErrors).toContain(
      'Self-host storage requires STORAGE_STRATEGY=LOCAL',
    );
  });

  it('reports managed capabilities without exposing provider configuration', () => {
    const snapshot = resolveRuntimeCapabilities({
      DATABASE_URL: 'postgresql://postgres:secret@postgres/app',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      EXTERNAL_PROVIDER_CREDENTIAL_SECRET: 'b'.repeat(32),
      STORAGE_STRATEGY: 'R2',
      BILLING_PROVIDER: 'external-provider',
      TELEMETRY_ENABLED: 'true',
      ACTIVITY_WEATHER_ENABLED: 'true',
    });

    expect(snapshot.capabilities.storage).toMatchObject({
      provider: 'managed',
      state: 'enabled',
    });
    expect(snapshot.capabilities.billing).toMatchObject({
      provider: 'managed',
      state: 'enabled',
    });
    expect(snapshot.capabilities.telemetry).toMatchObject({
      provider: 'managed',
      state: 'enabled',
    });
    expect(snapshot.capabilities.weather).toMatchObject({
      provider: 'managed',
      state: 'enabled',
    });
  });

  it('rejects weather flags without an explicit provider in Core Local', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({ ACTIVITY_WEATHER_ENABLED: 'true' }),
    );

    expect(snapshot.ready).toBe(false);
    expect(snapshot.capabilities.weather).toMatchObject({
      provider: 'external',
      state: 'misconfigured',
    });
    expect(snapshot.startupErrors).toContain(
      'weather must be disabled when SELF_HOST_MODE=core-local',
    );
  });

  it('rejects public demo mode in Core Local', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({
        PUBLIC_DEMO_ENABLED: 'true',
        PUBLIC_DEMO_ACCESS_SECRET: 'x'.repeat(32),
      }),
    );

    expect(snapshot.ready).toBe(false);
    expect(snapshot.capabilities['public-demo'].state).toBe('enabled');
    expect(snapshot.startupErrors).toContain(
      'public-demo must be disabled when SELF_HOST_MODE=core-local',
    );
  });

  it('preserves managed defaults for integration and agent APIs', () => {
    const snapshot = resolveRuntimeCapabilities({
      EXTERNAL_PROVIDER_CREDENTIAL_SECRET: 'b'.repeat(32),
    });

    expect(snapshot.capabilities['third-party-sync'].state).toBe('enabled');
    expect(snapshot.capabilities['intervals-icu-api-key'].state).toBe(
      'enabled',
    );
    expect(snapshot.capabilities['agent-api'].state).toBe('enabled');
    expect(snapshot.authenticationMethods.registration).toEqual({
      enabled: true,
      requiresEmailVerification: true,
    });
  });

  it('keeps self-host registration closed even with the legacy operator flag', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({ DISABLE_SIGNUP: 'false' }),
    );

    expect(snapshot.authenticationMethods.registration).toEqual({
      enabled: false,
      requiresEmailVerification: false,
    });
    expect(snapshot.authenticationMethods.emailVerification).toBe(false);
  });

  it('fails readiness for an invalid registration setting', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({ DISABLE_SIGNUP: 'sometimes' }),
    );

    expect(snapshot.ready).toBe(false);
    expect(snapshot.startupErrors).toContain(
      'DISABLE_SIGNUP must be true or false',
    );
  });

  it('does not infer social authentication from stale credentials in self-host', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({
        SELF_HOST_MODE: 'extended',
        OAUTH_GITHUB_CLIENT_ID: 'stale-id',
        OAUTH_GITHUB_CLIENT_SECRET: 'stale-secret',
      }),
    );

    expect(snapshot.authenticationMethods.social.github).toBeUndefined();
  });

  it('rejects explicit social authentication in Core Local', () => {
    const snapshot = resolveRuntimeCapabilities(
      coreLocal({ SOCIAL_AUTH_ENABLED: 'true' }),
    );

    expect(snapshot.ready).toBe(false);
    expect(snapshot.startupErrors).toContain(
      'SOCIAL_AUTH_ENABLED must be false when SELF_HOST_MODE=core-local',
    );
  });
});
