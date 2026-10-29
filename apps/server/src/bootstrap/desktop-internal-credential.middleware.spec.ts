import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { DESKTOP_INTERNAL_CREDENTIAL_HEADER } from '@shared/desktop-runtime-security';
import { desktopInternalCredentialMiddleware } from './desktop-internal-credential.middleware';

describe('desktopInternalCredentialMiddleware', () => {
  const previousCredential = process.env.DESKTOP_INTERNAL_CREDENTIAL;

  afterEach(() => {
    if (previousCredential === undefined) {
      delete process.env.DESKTOP_INTERNAL_CREDENTIAL;
    } else {
      process.env.DESKTOP_INTERNAL_CREDENTIAL = previousCredential;
    }
  });

  function invoke(header?: string) {
    const next = jest.fn() as NextFunction;
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const request = {
      get: (name: string) =>
        name === DESKTOP_INTERNAL_CREDENTIAL_HEADER ? header : undefined,
      originalUrl: '/api/status',
    } as unknown as Request;
    const response = { status } as unknown as Response;

    desktopInternalCredentialMiddleware(request, response, next);
    return { json, next, status };
  }

  it('does not alter non-Desktop deployments', () => {
    delete process.env.DESKTOP_INTERNAL_CREDENTIAL;
    const result = invoke('browser-value');
    expect(result.next).toHaveBeenCalledTimes(1);
    expect(result.status).not.toHaveBeenCalled();
  });

  it('accepts only the process credential when Desktop isolation is enabled', () => {
    process.env.DESKTOP_INTERNAL_CREDENTIAL = 'desktop-secret';
    expect(invoke('desktop-secret').next).toHaveBeenCalledTimes(1);

    const rejected = invoke('browser-value');
    expect(rejected.status).toHaveBeenCalledWith(403);
    expect(rejected.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'DESKTOP_INTERNAL_ACCESS_FORBIDDEN',
      }),
    );
  });
});
