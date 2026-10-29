import { describe, expect, it, jest } from '@jest/globals';
import { LoggerMiddleware, redactHttpLogValue } from '../logger.middleware';

describe('redactHttpLogValue', () => {
  it('redacts signed URLs and credentials recursively without mutating input', () => {
    const input = {
      region: 'china',
      downloadUrl: 'https://example.test/file.zip?signature=secret',
      nested: {
        accessToken: 'token-value',
        otp: '123456',
        verificationCode: '654321',
        count: 3,
      },
      rows: [{ apiKey: 'key-value', name: 'safe' }],
    };

    expect(redactHttpLogValue(input)).toEqual({
      region: 'china',
      downloadUrl: '[REDACTED]',
      nested: {
        accessToken: '[REDACTED]',
        otp: '[REDACTED]',
        verificationCode: '[REDACTED]',
        count: 3,
      },
      rows: [{ apiKey: '[REDACTED]', name: 'safe' }],
    });
    expect(input.downloadUrl).toContain('signature=secret');
  });
});

describe('LoggerMiddleware response logging', () => {
  it('keeps 4xx access logs informational so exception filters own severity', () => {
    const middleware = new LoggerMiddleware();
    const logger = {
      debug: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
    };
    (middleware as unknown as { logger: typeof logger }).logger = logger;
    let finish: (() => void) | undefined;
    const request = {
      body: {},
      connection: {},
      get: () => '',
      ip: '127.0.0.1',
      method: 'POST',
      originalUrl: '/public/convert',
      path: '/public/convert',
      query: {},
    };
    const response = {
      get: () => '152',
      on: (event: string, listener: () => void) => {
        if (event === 'finish') finish = listener;
      },
      statusCode: 400,
    };

    middleware.use(request as never, response as never, jest.fn());
    finish?.();

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('[请求结束] POST /public/convert 400 152b'),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('never writes raw IP or User-Agent for public AI workout review routes', () => {
    const middleware = new LoggerMiddleware();
    const logger = { debug: jest.fn(), error: jest.fn(), log: jest.fn() };
    (middleware as unknown as { logger: typeof logger }).logger = logger;
    const request = {
      body: {},
      connection: {},
      get: (name: string) =>
        name === 'user-agent' ? 'Private Browser/123.4' : undefined,
      ip: '203.0.113.42',
      method: 'POST',
      originalUrl: '/public/ai-workout-reviews?secret=value',
      path: '/public/ai-workout-reviews',
      query: { secret: 'value' },
    };
    const response = {
      get: () => undefined,
      on: jest.fn(),
      statusCode: 200,
    };

    middleware.use(request as never, response as never, jest.fn());

    const output = logger.log.mock.calls.flat().join(' ');
    expect(output).toContain('POST /public/ai-workout-reviews');
    expect(output).not.toContain('203.0.113.42');
    expect(output).not.toContain('Private Browser');
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('logs only request size metadata for the Intervals.icu webhook', () => {
    const middleware = new LoggerMiddleware();
    const logger = { debug: jest.fn(), error: jest.fn(), log: jest.fn() };
    (middleware as unknown as { logger: typeof logger }).logger = logger;
    const request = {
      body: {
        secret: 'webhook-secret',
        events: [{ athlete_id: 'private-athlete-id' }],
      },
      connection: {},
      get: (name: string) =>
        name === 'content-length' ? '112640' : 'Java-http-client/21',
      ip: '203.0.113.42',
      method: 'POST',
      originalUrl: '/intervals-icu/webhook/callback',
      path: '/intervals-icu/webhook/callback',
      query: {},
    };
    const response = {
      get: () => undefined,
      on: jest.fn(),
      statusCode: 200,
    };

    middleware.use(request as never, response as never, jest.fn());

    const output = logger.log.mock.calls.flat().join(' ');
    expect(output).toContain('privacy=restricted');
    expect(output).toContain('declaredBodyBytes=112640');
    expect(output).not.toContain('203.0.113.42');
    expect(output).not.toContain('Java-http-client');
    expect(output).not.toContain('private-athlete-id');
    expect(output).not.toContain('webhook-secret');
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('never logs sensitive bearer tokens or operator notes', () => {
    const middleware = new LoggerMiddleware();
    const logger = { debug: jest.fn(), error: jest.fn(), log: jest.fn() };
    (middleware as unknown as { logger: typeof logger }).logger = logger;
    const response = {
      get: () => undefined,
      on: jest.fn(),
      statusCode: 200,
    };

    for (const request of [
      {
        body: { token: 'raw-gift-token' },
        originalUrl: '/access-grants/claim',
        path: '/access-grants/claim',
      },
      {
        body: { accessDays: 30, note: 'private campaign cohort' },
        originalUrl: '/operations/access-grants',
        path: '/operations/access-grants',
      },
    ]) {
      middleware.use(
        {
          ...request,
          connection: {},
          get: () => 'Private Browser/123.4',
          ip: '203.0.113.42',
          method: 'POST',
          query: {},
        } as never,
        response as never,
        jest.fn(),
      );
    }

    const output = logger.log.mock.calls.flat().join(' ');
    expect(output).not.toContain('raw-gift-token');
    expect(output).not.toContain('private campaign cohort');
    expect(output).not.toContain('203.0.113.42');
    expect(output).not.toContain('Private Browser');
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('never logs bootstrap credentials or owner identity', () => {
    const middleware = new LoggerMiddleware();
    const logger = { debug: jest.fn(), error: jest.fn(), log: jest.fn() };
    (middleware as unknown as { logger: typeof logger }).logger = logger;
    const response = {
      get: () => undefined,
      on: jest.fn(),
      statusCode: 200,
    };

    middleware.use(
      {
        body: {
          token: 'raw-bootstrap-token',
          email: 'owner@example.test',
          password: 'owner-password-42',
          name: 'Private Owner',
        },
        connection: {},
        get: () => 'Private Browser/123.4',
        ip: '203.0.113.42',
        method: 'POST',
        originalUrl: '/api/self-host/bootstrap/owner',
        path: '/api/self-host/bootstrap/owner',
        query: {},
      } as never,
      response as never,
      jest.fn(),
    );

    const output = logger.log.mock.calls.flat().join(' ');
    expect(output).toContain('privacy=restricted');
    expect(output).not.toMatch(
      /raw-bootstrap-token|owner@example\.test|owner-password-42|Private Owner|203\.0\.113\.42|Private Browser/,
    );
    expect(logger.debug).not.toHaveBeenCalled();
  });
});
