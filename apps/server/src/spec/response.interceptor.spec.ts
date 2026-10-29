import { HttpStatus } from '@nestjs/common';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { I18nContext } from 'nestjs-i18n';
import { lastValueFrom, of } from 'rxjs';

import { ResponseInterceptor } from '../response.interceptor';

function interceptor(rawResponse = false) {
  return new ResponseInterceptor({
    getAllAndOverride: jest.fn(() => rawResponse),
  } as never);
}

const context = {
  getHandler: jest.fn(),
  getClass: jest.fn(),
} as never;

describe('ResponseInterceptor', () => {
  afterEach(() => jest.restoreAllMocks());

  it('wraps successful controller data', async () => {
    jest.spyOn(I18nContext, 'current').mockReturnValue(undefined);
    const responseInterceptor = interceptor();

    await expect(
      lastValueFrom(
        responseInterceptor.intercept(context, {
          handle: () => of({ id: 'activity-1' }),
        }),
      ),
    ).resolves.toEqual({
      code: HttpStatus.OK,
      message: 'Request succeeded',
      data: { id: 'activity-1' },
    });
  });

  it('routes accidentally returned Error objects into the exception filters', async () => {
    jest.spyOn(I18nContext, 'current').mockReturnValue(undefined);
    const responseInterceptor = interceptor();
    const error = new Error('database unavailable');

    await expect(
      lastValueFrom(
        responseInterceptor.intercept(context, {
          handle: () => of(error),
        }),
      ),
    ).rejects.toBe(error);
  });

  it('preserves exact machine-readable responses when requested', async () => {
    const responseInterceptor = interceptor(true);
    const readiness = {
      status: 'ready',
      timestamp: '2026-10-19T00:00:00.000Z',
      checks: { configuration: 'ready', database: 'ready' },
    };

    await expect(
      lastValueFrom(
        responseInterceptor.intercept(context, {
          handle: () => of(readiness),
        }),
      ),
    ).resolves.toEqual(readiness);
  });
});
