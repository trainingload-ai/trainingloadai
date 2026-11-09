import { describe, expect, it, jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { AllExceptionsFilter, HttpExceptionFilter } from '@/filters/http-exception/http-exception.filter';
import { LoggerMiddleware } from '@/middleware/logger.middleware';

describe('personal provider HTTP privacy', () => {
  const logger = () => ({ error: jest.fn(), warn: jest.fn(), log: jest.fn(), debug: jest.fn() });
  function context(url: string) {
    const response: any = { status: jest.fn().mockReturnThis(), header: jest.fn().mockReturnThis(), json: jest.fn() };
    return { response, host: { switchToHttp: () => ({ getRequest: () => ({ method: 'GET', url }), getResponse: () => response }) } as never };
  }
  it('does not log personal key, OAuth code, route XML or account-identifying headers', () => {
    const middleware = new LoggerMiddleware(), output = logger();
    (middleware as any).logger = output;
    middleware.use({ method: 'POST', path: '/api/coros-mcp/operations/preview', originalUrl: '/api/coros-mcp/operations/preview?code=fixture-oauth-code', body: { fileContent: 'fixture-private-route-xml', apiKey: 'fixture-private-key' }, query: { code: 'fixture-oauth-code' }, connection: {}, get: () => 'fixture-user-agent', ip: '192.0.2.42' } as never, { on: jest.fn() } as never, jest.fn());
    expect(JSON.stringify(output.log.mock.calls)).toContain('privacy=restricted');
    expect(JSON.stringify(output.log.mock.calls)).not.toMatch(/fixture-oauth-code|fixture-private|fixture-user-agent|192\.0\.2\.42/);
    expect(output.debug).not.toHaveBeenCalled();
  });
  it('strips OAuth query strings from exception logs and response paths', () => {
    const output = logger(), { host, response } = context('/api/coros-mcp/oauth/callback?code=fixture-oauth-code&state=fixture-state');
    new HttpExceptionFilter(output as never).catch(new HttpException({ code: 'PROVIDER_REQUEST_FAILED', message: 'PROVIDER_REQUEST_FAILED' }, 502), host);
    expect(JSON.stringify(output.error.mock.calls)).not.toMatch(/fixture-oauth-code|fixture-state/);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/coros-mcp/oauth/callback' }));
  });
  it('does not expose upstream bodies or decoder fragments through unexpected-error stacks', () => {
    const output = logger(), { host, response } = context('/api/garmin-personal/connect');
    new AllExceptionsFilter(output as never).catch(new Error('fixture-private-key in an upstream decoder'), host);
    expect(JSON.stringify(output.error.mock.calls)).not.toContain('fixture-private-key');
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('fixture-private-key');
  });
});
