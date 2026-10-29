import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import Ajv2020 from 'ajv/dist/2020';

const schema = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../../schemas/self-host-config.schema.json'),
    'utf8',
  ),
) as object;

function validator() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });
  return ajv.compile(schema);
}

const coreLocal = {
  SELF_HOST_MODE: 'core-local',
  DATABASE_URL: 'postgresql://postgres:secret@db:5432/trainingload',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  EXTERNAL_PROVIDER_CREDENTIAL_SECRET: 'y'.repeat(32),
  STORAGE_STRATEGY: 'LOCAL',
  NEXT_PUBLIC_APP_URL: 'http://localhost',
  NEXT_PUBLIC_API_URL: 'http://localhost',
  TRUSTED_ORIGINS: 'http://localhost',
  SELF_HOST_HTTP_BIND: '127.0.0.1',
  SELF_HOST_GATEWAY_ADDRESS: 'http://:80',
  MAP_PROVIDER: 'none',
  ELEVATION_PROVIDER: 'none',
  MAIL_PROVIDER: 'none',
  AI_PROVIDER: 'none',
  BILLING_PROVIDER: 'none',
  TELEMETRY_ENABLED: false,
  WEATHER_PROVIDER: 'none',
  ACTIVITY_WEATHER_ENABLED: false,
  AI_TODAY_WEATHER_ENABLED: false,
  THIRD_PARTY_SYNC_ENABLED: false,
  AGENT_CAPABILITIES_ENABLED: false,
  SOCIAL_AUTH_ENABLED: false,
  PUBLIC_DEMO_ENABLED: false,
};

describe('self-host configuration JSON schema', () => {
  it('accepts the credential-free core-local contract', () => {
    const validate = validator();
    expect(validate(coreLocal)).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('accepts a complete custom OpenAI-compatible extended profile', () => {
    const validate = validator();
    expect(
      validate({
        ...coreLocal,
        SELF_HOST_MODE: 'extended',
        AI_PROVIDER: 'custom-openai-compatible',
        AI_API_KEY: 'operator-secret',
        AI_BASE_URL: 'http://llm:11434/v1',
        AI_DEFAULT_MODEL: 'local-fast',
        AI_REASONING_MODEL: 'local-reasoning',
      }),
    ).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('accepts explicit OpenAI BYOK in core-local', () => {
    const validate = validator();
    expect(
      validate({
        ...coreLocal,
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'operator-secret',
        OPENAI_DEFAULT_MODEL: 'standard-model',
        OPENAI_REASONING_MODEL: 'reasoning-model',
      }),
    ).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('rejects incomplete AI provider groups', () => {
    const validate = validator();
    expect(
      validate({
        ...coreLocal,
        AI_PROVIDER: 'custom-openai-compatible',
        AI_BASE_URL: 'http://llm:11434/v1',
        AI_DEFAULT_MODEL: 'local-fast',
        AI_REASONING_MODEL: 'local-reasoning',
      }),
    ).toBe(false);
    expect(validate.errors?.map((error) => error.keyword)).toContain(
      'required',
    );
  });

  it('accepts a connected OSM browser-only map profile', () => {
    const validate = validator();
    expect(
      validate({
        ...coreLocal,
        SELF_HOST_MODE: 'connected',
        MAP_PROVIDER: 'osm-raster',
        MAP_ATTRIBUTION: '© OpenStreetMap contributors',
      }),
    ).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('accepts OpenFreeMap without a token or custom URL', () => {
    const validate = validator();
    expect(
      validate({
        ...coreLocal,
        SELF_HOST_MODE: 'connected',
        MAP_PROVIDER: 'openfreemap',
      }),
    ).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('rejects empty custom map endpoints and missing attribution', () => {
    const validate = validator();
    expect(
      validate({
        ...coreLocal,
        SELF_HOST_MODE: 'extended',
        MAP_PROVIDER: 'custom-style',
        MAP_STYLE_URL: '',
      }),
    ).toBe(false);
    expect(validate.errors?.map((error) => error.keyword)).toEqual(
      expect.arrayContaining(['minLength', 'required']),
    );
  });
});
