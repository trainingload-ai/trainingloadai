import { describe, expect, it } from '@jest/globals';
import {
  checkLocalBrowserRequest,
  resolveSelfHostAccessMode,
} from './self-host-local-access-policy';

const localEnv = {
  SELF_HOST_MODE: 'core-local',
  SELF_HOST_HTTP_BIND: '127.0.0.1',
  NEXT_PUBLIC_APP_URL: 'http://localhost:43210',
};

describe('self-host local access policy', () => {
  it('enables passwordless owner access only for a loopback bind and origin', () => {
    expect(resolveSelfHostAccessMode(localEnv)).toBe('local-owner');
    expect(
      resolveSelfHostAccessMode({
        ...localEnv,
        SELF_HOST_HTTP_BIND: '0.0.0.0',
        NEXT_PUBLIC_APP_URL: 'http://192.168.1.20:43210',
      }),
    ).toBe('credentials');
    expect(
      resolveSelfHostAccessMode({
        ...localEnv,
        SELF_HOST_HTTP_BIND: '0.0.0.0',
      }),
    ).toBe('credentials');
  });

  it('requires the configured loopback origin or an equivalent loopback alias', () => {
    const headers = new Headers({
      origin: 'http://localhost:43210',
      'sec-fetch-site': 'same-origin',
      // Docker Desktop NAT exposes the host browser as its gateway address
      // inside the container. The trusted host bind, not this value, proves
      // that the instance is local-only.
      'x-trainingload-client-ip': '192.168.65.1',
    });
    expect(checkLocalBrowserRequest(headers, localEnv)).toEqual({ ok: true });

    // localhost and 127.0.0.1 are equivalent local entry points when the
    // protocol and public port still match the configured loopback origin.
    headers.set('origin', 'http://127.0.0.1:43210');
    expect(checkLocalBrowserRequest(headers, localEnv)).toEqual({ ok: true });

    headers.set('origin', 'http://127.0.0.1:43211');
    expect(checkLocalBrowserRequest(headers, localEnv)).toEqual({
      ok: false,
      reason: 'SAME_ORIGIN_REQUIRED',
    });

    headers.set('origin', 'https://127.0.0.1:43210');
    expect(checkLocalBrowserRequest(headers, localEnv)).toEqual({
      ok: false,
      reason: 'SAME_ORIGIN_REQUIRED',
    });

    headers.set('origin', 'https://attacker.example');
    expect(checkLocalBrowserRequest(headers, localEnv)).toEqual({
      ok: false,
      reason: 'SAME_ORIGIN_REQUIRED',
    });
    headers.set('origin', 'http://localhost:43210');
    headers.delete('sec-fetch-site');
    expect(checkLocalBrowserRequest(headers, localEnv)).toEqual({
      ok: false,
      reason: 'SAME_ORIGIN_REQUIRED',
    });
  });
});
