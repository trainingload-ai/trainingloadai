import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const SENSITIVE_LOG_KEY =
  /(^otp$|one[-_]?time|verification[-_]?code|password|passcode|token|secret|authorization|cookie|credential|api[-_]?key|url|uri)/i;

export function redactHttpLogValue(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactHttpLogValue(item, seen));
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SENSITIVE_LOG_KEY.test(key)
        ? '[REDACTED]'
        : redactHttpLogValue(child, seen),
    ]),
  );
}

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, body, query } = req;
    const userAgent = req.get('user-agent') || '';
    const ip = req.ip || req.connection.remoteAddress;
    const isReadHealthCheck = method === 'GET' || method === 'HEAD';
    const isHealthCheck =
      isReadHealthCheck && (req.path === '/' || req.path === '/api/health');
    const requestPath = originalUrl.split('?', 1)[0] || req.path;
    const isPublicAiReview = requestPath.startsWith(
      '/public/ai-workout-review',
    );
    const isIntervalsIcuWebhook =
      requestPath === '/intervals-icu/webhook/callback';
    const isSensitiveBearerRoute =
      /^\/public\/[^/]+\/preview$/.test(requestPath) ||
      /^\/[^/]+\/claim$/.test(requestPath);
    const isSensitiveOperationsRoute = /^\/operations\/[^/]+/.test(requestPath);
    const isSelfHostBootstrapRoute = requestPath.startsWith(
      '/api/self-host/bootstrap',
    );
    const isPrivacyRestricted =
      isPublicAiReview ||
      isIntervalsIcuWebhook ||
      isSensitiveBearerRoute ||
      isSensitiveOperationsRoute ||
      isSelfHostBootstrapRoute;
    const declaredBodyBytes = req.get('content-length') || 'unknown';

    // 记录请求开始
    if (!isHealthCheck) {
      this.logger.log(
        isPrivacyRestricted
          ? `[请求开始] ${method} ${requestPath} - privacy=restricted${
              isIntervalsIcuWebhook
                ? ` - declaredBodyBytes=${declaredBodyBytes}`
                : ''
            }`
          : `[请求开始] ${method} ${requestPath} - UA=${userAgent} - IP=${ip}`,
      );
    }

    // 如果有请求体，记录它（但要小心敏感信息）
    if (
      !isHealthCheck &&
      !isPrivacyRestricted &&
      body &&
      Object.keys(body).length > 0
    ) {
      this.logger.debug(
        `[请求体] ${JSON.stringify(redactHttpLogValue(body), null, 2)}`,
      );
    }

    // 如果有查询参数，记录它们
    if (
      !isHealthCheck &&
      !isPrivacyRestricted &&
      query &&
      Object.keys(query).length > 0
    ) {
      this.logger.debug(
        `[查询参数] ${JSON.stringify(redactHttpLogValue(query), null, 2)}`,
      );
    }

    const startTime = Date.now();

    // 监听响应完成
    res.on('finish', () => {
      if (isHealthCheck) return;

      const { statusCode } = res;
      const contentLength = res.get('content-length');
      const duration = Date.now() - startTime;

      const logMessage = `[请求结束] ${method} ${requestPath} ${statusCode} ${
        contentLength || 0
      }b - ${duration}ms`;

      // 异常详情及严重级别由全局异常过滤器统一记录，访问日志只记录结果。
      // 避免同一个 4xx/5xx 请求在服务、过滤器和中间件中重复记为 ERROR。
      this.logger.log(logMessage);
    });

    next();
  }
}
