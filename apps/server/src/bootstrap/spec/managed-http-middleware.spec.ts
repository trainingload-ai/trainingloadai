import {
  Controller,
  Global,
  HttpCode,
  MiddlewareConsumer,
  Module,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, raw, type Request } from 'express';
import request = require('supertest');
import { bootstrapApplication } from '../bootstrap-application';
import { MANAGED_STARTUP, type ManagedStartup } from '../managed-startup.port';
import { ResponseInterceptor } from '../../response.interceptor';
import { RuntimeCapabilityService } from '../../runtime-capabilities/runtime-capability.service';

@Controller()
class ProbeController {
  @Post(['provider', 'ordinary'])
  @HttpCode(200)
  receive(@Req() req: Request) {
    return { raw: Buffer.isBuffer(req.body), bytes: req.body?.length };
  }
}

const order: string[] = [];
@Global()
@Module({})
class GlobalJsonModule {
  configure(consumer: MiddlewareConsumer) {
    order.push('module-parser');
    consumer.apply(json()).forRoutes('*path');
  }
}

function rootModule(startup?: ManagedStartup) {
  @Module({
    imports: [GlobalJsonModule],
    controllers: [ProbeController],
    providers: [
      ResponseInterceptor,
      { provide: ConfigService, useValue: new ConfigService() },
      {
        provide: RuntimeCapabilityService,
        useValue: {
          snapshot: () => ({ startupWarnings: [] }),
          isEnabled: () => false,
        },
      },
      ...(startup ? [{ provide: MANAGED_STARTUP, useValue: startup }] : []),
    ],
  })
  class RootModule {}
  return RootModule;
}

describe('deployment middleware in the real shared bootstrap', () => {
  const previous = { PORT: process.env.PORT, HOST: process.env.HOST };
  let app: NestExpressApplication | undefined;
  beforeEach(() => {
    process.env.PORT = '0';
    process.env.HOST = '127.0.0.1';
    order.length = 0;
  });
  afterEach(async () => {
    await app?.close();
    app = undefined;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('installs the extension before a global module parser even when remote registration is disabled', async () => {
    const remote = jest.fn(async () => {});
    app = await bootstrapApplication(
      rootModule({
        configureHttpMiddleware(application) {
          order.push('hook');
          application.use(
            '/provider',
            raw({ type: 'application/json', limit: '1mb' }),
          );
        },
        initializeRemoteWebhooks: remote,
      }),
    );
    expect(order).toEqual(['hook', 'module-parser']);
    const result = await request(app.getHttpServer())
      .post('/provider')
      .send({ padding: 'x'.repeat(600_000) })
      .expect(200);
    expect(result.body.data.raw).toBe(true);
    await request(app.getHttpServer())
      .post('/ordinary')
      .send({ padding: 'x'.repeat(600_000) })
      .expect(413);
    expect(remote).not.toHaveBeenCalled();
  });

  it('preserves standalone startup when the optional deployment provider is absent', async () => {
    app = await bootstrapApplication(rootModule());
    await request(app.getHttpServer())
      .post('/ordinary')
      .send({ value: 1 })
      .expect(200);
  });

  it('propagates hook failure before listening instead of swallowing it as a missing provider', async () => {
    await expect(
      bootstrapApplication(
        rootModule({
          configureHttpMiddleware(application) {
            app = application;
            throw new Error('configuration failed');
          },
          initializeRemoteWebhooks: async () => {},
        }),
      ),
    ).rejects.toThrow('configuration failed');
    expect(app?.getHttpServer().listening).toBe(false);
  });
});
