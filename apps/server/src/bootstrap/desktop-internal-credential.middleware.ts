import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

import { DESKTOP_INTERNAL_CREDENTIAL_HEADER } from '@shared/desktop-runtime-security';

const ERROR_CODE = 'DESKTOP_INTERNAL_ACCESS_FORBIDDEN';

function credentialsMatch(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * Desktop 进程启动 Server 时会通过 IPC 注入一次性凭证。启用后，所有 HTTP
 * 请求都必须来自持有同一凭证的本地 BFF；普通 Web/Self-host 部署不设置该变量。
 */
export function desktopInternalCredentialMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const expected = process.env.DESKTOP_INTERNAL_CREDENTIAL;
  if (!expected) {
    next();
    return;
  }

  const candidate = request.get(DESKTOP_INTERNAL_CREDENTIAL_HEADER);
  if (credentialsMatch(candidate, expected)) {
    next();
    return;
  }

  response.status(403).json({
    code: 403,
    data: null,
    errorCode: ERROR_CODE,
    error_code: ERROR_CODE,
    message: 'Desktop internal access forbidden',
    path: request.originalUrl,
  });
}
