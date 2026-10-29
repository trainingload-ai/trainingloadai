import { ExceptionFilter, Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { Response } from 'express';
import { BusinessException } from './business.exception';
import { BUSINESS_ERROR_CODE } from './business-exception.error.codes';
import { getSafeHttpMessage } from '../http-exception/http-exception.filter';

/** 将稳定业务错误码映射为 HTTP 状态，供过滤器和契约测试共用。 */
export function businessErrorHttpStatus(code: number) {
  if (
    code === BUSINESS_ERROR_CODE.ACTIVITY_NOT_FOUND ||
    code === BUSINESS_ERROR_CODE.USER_NOT_FOUND ||
    code === BUSINESS_ERROR_CODE.RESOURCE_NOT_FOUND ||
    code === BUSINESS_ERROR_CODE.STORAGE_FILE_NOT_FOUND
  ) {
    return 404;
  }
  if (
    code === BUSINESS_ERROR_CODE.ACCESS_FORBIDDEN ||
    code === BUSINESS_ERROR_CODE.PERMISSION_DISABLED ||
    code === BUSINESS_ERROR_CODE.USER_DISABLED ||
    code === BUSINESS_ERROR_CODE.AI_DATA_CONSENT_REQUIRED
  ) {
    return 403;
  }
  if (
    code === BUSINESS_ERROR_CODE.TOKEN_INVALID ||
    code === BUSINESS_ERROR_CODE.UNAUTHORIZED
  ) {
    return 401;
  }
  if (
    code === BUSINESS_ERROR_CODE.CONFLICT ||
    code === BUSINESS_ERROR_CODE.WORKOUT_IMMUTABLE ||
    code === BUSINESS_ERROR_CODE.PLAN_PROPOSAL_EXPIRED ||
    code === BUSINESS_ERROR_CODE.PLAN_PROPOSAL_CONFLICT
  )
    return 409;
  if (
    code === BUSINESS_ERROR_CODE.UNPROCESSABLE_ENTITY ||
    code === BUSINESS_ERROR_CODE.PLAN_PROPOSAL_INVALID
  )
    return 422;
  if (code === BUSINESS_ERROR_CODE.INTERNAL_SERVER_ERROR) return 500;
  if (code === BUSINESS_ERROR_CODE.STORAGE_NO_SPACE) return 507;
  if (code === BUSINESS_ERROR_CODE.STORAGE_NOT_WRITABLE) return 500;
  if (code === BUSINESS_ERROR_CODE.CAPABILITY_DISABLED) return 503;
  if (code === BUSINESS_ERROR_CODE.CAPABILITY_MISCONFIGURED) return 503;
  return 400;
}

@Catch(BusinessException)
export class BusinessExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(BusinessExceptionFilter.name);

  catch(exception: BusinessException, host: ArgumentsHost) {
    // BusinessException 使用业务 code，HTTP 状态在这里集中映射，避免各 service 自己决定 status。
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const errorResponse = exception.getResponse() as {
      code: number;
      message: string;
    };

    const status = businessErrorHttpStatus(errorResponse.code);

    // 保持与 HttpExceptionFilter 一致的返回格式
    const result = {
      code: errorResponse.code,
      message: getSafeHttpMessage(status, errorResponse.message, null),
      data: null,
      date: new Date().getTime(),
      path: request.url,
    };
    this.logger.warn(
      `[业务异常] ${request.method} ${request.url} - 代码=${errorResponse.code} - 状态=${status} - message=${result.message}`,
    );
    response.status(status).json(result);
  }
}
