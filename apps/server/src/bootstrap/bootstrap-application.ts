import { Logger, type Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'path';

import { BusinessExceptionFilter } from '@/filters/business-exception/business-exception.filter';
import {
  AllExceptionsFilter,
  HttpExceptionFilter,
} from '@/filters/http-exception/http-exception.filter';
import { ResponseInterceptor } from '@/response.interceptor';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import { publicStoragePath } from '@/storage/storage-path';
import { isCorsOriginAllowed, parseOriginList } from './cors-origin';
import { CORS_ALLOWED_HEADERS } from './cors-options';
import { desktopInternalCredentialMiddleware } from './desktop-internal-credential.middleware';
import { registerIntervalsIcuWebhookBodyParser } from './intervals-icu-webhook-body-parser';
import { createGlobalValidationPipe } from './runtime-safety';
import { resolveTrustProxySetting } from './self-host-network-security';
import { MANAGED_STARTUP, type ManagedStartup } from './managed-startup.port';

let applicationDuringBootstrap: NestExpressApplication | undefined;

/**
 * 两种部署入口共享的 HTTP 启动流程。部署差异只能存在于传入的 Nest
 * composition root，不能在这里通过环境变量动态加载私有模块。
 */
export async function bootstrapApplication(
  rootModule: Type<unknown>,
): Promise<NestExpressApplication> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(rootModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    bodyParser: false,
  });
  applicationDuringBootstrap = app;

  app.disable('x-powered-by');
  app.use(desktopInternalCredentialMiddleware);

  const trustProxy = resolveTrustProxySetting(process.env);
  if (trustProxy !== false) app.set('trust proxy', trustProxy);

  app.use((_request, response, next) => {
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const domainBase = process.env.DOMAIN_BASE?.trim();
      const trustedOrigins = parseOriginList(process.env.TRUSTED_ORIGINS);
      return callback(
        null,
        isCorsOriginAllowed(origin, domainBase, trustedOrigins),
      );
    },
    exposedHeaders: [
      'Content-Disposition',
      'X-Custom-Header',
      'WWW-Authenticate',
      'Mcp-Session-Id',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [...CORS_ALLOWED_HEADERS],
    optionsSuccessStatus: 204,
  });

  registerIntervalsIcuWebhookBodyParser(app);
  app.enableShutdownHooks();
  app.useGlobalPipes(createGlobalValidationPipe());
  app.useGlobalInterceptors(app.get(ResponseInterceptor));
  app.useGlobalFilters(
    new AllExceptionsFilter(new Logger()),
    new HttpExceptionFilter(new Logger()),
    new BusinessExceptionFilter(),
  );

  logger.log(`
    🙏🌸 许愿 🕯️ 🌸🙏
    =======================
    🔮 愿环境变量顺利加载
    ⏳ 若遇问题，请放慢脚步，心平气和地排查。
    💻 当前环境变量：${process.env.NODE_ENV}
    =======================
    🕊️ 启动成功，祝一切顺利！
    🙏🌸
  `);

  const uploadsPath = publicStoragePath(
    resolve(process.env.LOCAL_STORAGE_PATH || '/data/uploads'),
  );
  app.useStaticAssets(uploadsPath, { prefix: '/uploads/' });

  await app.listen(process.env.PORT || 3001, process.env.HOST || '0.0.0.0');

  const configService = app.get(ConfigService);
  const runtimeCapabilities = app.get(RuntimeCapabilityService);
  for (const warning of runtimeCapabilities.snapshot().startupWarnings) {
    logger.warn(`[self-host] ${warning}`);
  }
  const webhookBootstrapEnabled =
    runtimeCapabilities.isEnabled('third-party-sync') &&
    configService.get<boolean>('thirdPartyWebhookBootstrap.enabled') === true;

  if (!webhookBootstrapEnabled) {
    logger.log(
      '[bootstrap] 已跳过第三方 webhook 远端自动注册（当前部署未启用或未设置 THIRD_PARTY_WEBHOOK_BOOTSTRAP=true）',
    );
  } else {
    let managedStartup: ManagedStartup | undefined;
    try {
      managedStartup = app.get<ManagedStartup>(MANAGED_STARTUP, {
        strict: false,
      });
    } catch {
      logger.warn('[bootstrap] 当前部署未装配远端 Webhook 初始化器');
    }
    await managedStartup?.initializeRemoteWebhooks();
  }

  applicationDuringBootstrap = undefined;
  return app;
}

export async function startApplication(rootModule: Type<unknown>) {
  let app: NestExpressApplication | undefined;
  try {
    app = await bootstrapApplication(rootModule);
  } catch (error) {
    const logger = new Logger('Bootstrap');
    logger.error(
      `[bootstrap] 服务启动失败：${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
    await (app ?? applicationDuringBootstrap)?.close().catch(() => undefined);
    applicationDuringBootstrap = undefined;
    process.exitCode = 1;
  }
}
