import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

type StructuredExceptionResponse = Record<string, unknown> & {
  code?: unknown;
  data?: unknown;
  localized?: unknown;
  message?: unknown;
  messageArgs?: unknown;
  messageKey?: unknown;
};

type RequestAbortState = {
  aborted?: unknown;
  complete?: unknown;
  destroyed?: unknown;
  readableAborted?: unknown;
};

type PayloadTooLargeError = {
  length?: unknown;
  limit?: unknown;
  received?: unknown;
  type?: unknown;
};

const STATUS_MESSAGE_KEYS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'common.error.invalid_request',
  [HttpStatus.UNAUTHORIZED]: 'common.error.unauthorized',
  [HttpStatus.FORBIDDEN]: 'common.error.forbidden',
  [HttpStatus.NOT_FOUND]: 'common.error.not_found',
  [HttpStatus.CONFLICT]: 'common.error.conflict',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'common.error.payload_too_large',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'common.error.unprocessable_entity',
  [HttpStatus.TOO_MANY_REQUESTS]: 'common.error.too_many_requests',
};

const ENGLISH_STATUS_FALLBACKS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Invalid request parameters',
  [HttpStatus.UNAUTHORIZED]: 'Authentication is required',
  [HttpStatus.FORBIDDEN]: 'You do not have permission to perform this action',
  [HttpStatus.NOT_FOUND]: 'The requested resource was not found',
  [HttpStatus.CONFLICT]: 'The request conflicts with the current state',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'The uploaded file is too large.',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'The request could not be processed',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too many requests, please try again later.',
};

function normalizeErrorMessage(message: unknown): string | undefined {
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message)) {
    const picked = message.filter(
      (item): item is string =>
        typeof item === 'string' && Boolean(item.trim()),
    );
    if (picked.length > 0) return picked.join('; ');
  }
  return undefined;
}

function getTranslation(
  i18n: I18nContext | undefined,
  key: string,
  args?: Record<string, unknown>,
): string | undefined {
  if (!i18n) return undefined;
  const translated = i18n.t(key, args ? { args } : undefined);
  return typeof translated === 'string' && translated !== key
    ? translated
    : undefined;
}

function getErrorCodeMessageKey(code: unknown): string | undefined {
  if (typeof code !== 'string' || !/^[A-Z][A-Z0-9_]+$/.test(code)) {
    return undefined;
  }
  return `common.error.${code.toLowerCase()}`;
}

export function normalizeHttpStatus(value: unknown): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= HttpStatus.BAD_REQUEST &&
    value <= 599
    ? value
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

function isClientAbortException(
  exception: unknown,
  request: RequestAbortState,
): boolean {
  if (!(exception instanceof Error)) return false;
  if (
    exception.message !== 'Request aborted' &&
    exception.message !== 'Request closed'
  ) {
    return false;
  }

  return (
    request.aborted === true ||
    request.readableAborted === true ||
    (request.destroyed === true && request.complete !== true)
  );
}

function safeByteCount(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? String(value)
    : 'unknown';
}

function safeContentLength(request: {
  get?: (name: string) => unknown;
  headers?: Record<string, unknown>;
}): string {
  const raw =
    request.get?.('content-length') ?? request.headers?.['content-length'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && /^\d+$/.test(value) ? value : 'unknown';
}

function payloadTooLargeLogDetails(
  exception: unknown,
  request: {
    get?: (name: string) => unknown;
    headers?: Record<string, unknown>;
  },
): string {
  const error =
    exception && typeof exception === 'object'
      ? (exception as PayloadTooLargeError)
      : {};
  const type =
    typeof error.type === 'string' && /^[a-z0-9._-]+$/i.test(error.type)
      ? error.type
      : 'unknown';
  return [
    `declaredBodyBytes=${safeContentLength(request)}`,
    `length=${safeByteCount(error.length)}`,
    `received=${safeByteCount(error.received)}`,
    `limit=${safeByteCount(error.limit)}`,
    `type=${type}`,
  ].join(' ');
}

function containsDistinctLocalizedValue(
  localized: unknown,
  english: unknown,
  message: string,
): boolean {
  if (typeof localized === 'string') {
    return localized === message && localized !== english;
  }
  if (!localized || typeof localized !== 'object' || Array.isArray(localized)) {
    return false;
  }
  const englishRecord =
    english && typeof english === 'object' && !Array.isArray(english)
      ? (english as Record<string, unknown>)
      : {};
  return Object.entries(localized as Record<string, unknown>).some(
    ([key, value]) =>
      containsDistinctLocalizedValue(value, englishRecord[key], message),
  );
}

function isKnownLocalizedMessage(
  i18n: I18nContext | undefined,
  message: string,
): boolean {
  if (!i18n) return false;
  const translations = i18n.service.getTranslations();
  const language = i18n.service.resolveLanguage(i18n.lang);
  return containsDistinctLocalizedValue(
    translations[language],
    translations.en,
    message,
  );
}

export function getSafeHttpMessage(
  status: number,
  rawMessage: unknown,
  structuredResponse: StructuredExceptionResponse | null,
): string {
  const i18n = I18nContext.current();

  if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
    return (
      getTranslation(i18n, 'common.error.internal') ??
      'Something went wrong on our end. Please try again later.'
    );
  }

  const explicitKey =
    typeof structuredResponse?.messageKey === 'string'
      ? structuredResponse.messageKey
      : undefined;
  const messageArgs =
    structuredResponse?.messageArgs &&
    typeof structuredResponse.messageArgs === 'object' &&
    !Array.isArray(structuredResponse.messageArgs)
      ? (structuredResponse.messageArgs as Record<string, unknown>)
      : undefined;
  const codeKey = getErrorCodeMessageKey(structuredResponse?.code);
  const translatedSpecific =
    (explicitKey && getTranslation(i18n, explicitKey, messageArgs)) ||
    (codeKey && getTranslation(i18n, codeKey, messageArgs));
  if (translatedSpecific) return translatedSpecific;

  const normalizedRawMessage = normalizeErrorMessage(rawMessage);
  const language = i18n?.lang?.toLowerCase();
  if (
    normalizedRawMessage &&
    (language === 'en' ||
      language?.startsWith('en-') ||
      isKnownLocalizedMessage(i18n, normalizedRawMessage) ||
      structuredResponse?.localized === true)
  ) {
    return normalizedRawMessage;
  }

  const statusKey =
    STATUS_MESSAGE_KEYS[status] ?? 'common.error.request_failed';
  return (
    getTranslation(i18n, statusKey) ??
    ENGLISH_STATUS_FALLBACKS[status] ??
    'Request failed'
  );
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const structuredResponse =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as StructuredExceptionResponse)
        : null;
    const rawMessage =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : structuredResponse?.message || exception.message;
    const message = getSafeHttpMessage(status, rawMessage, structuredResponse);
    const stableCode =
      typeof structuredResponse?.code === 'string'
        ? structuredResponse.code
        : null;

    const errorResponse = {
      code: status,
      ...(stableCode
        ? {
            error_code: stableCode,
            // Transitional alias for older Web/Mobile releases. New clients
            // use error_code consistently with the SSE protocol.
            errorCode: stableCode,
          }
        : {}),
      message,
      data: structuredResponse?.data ?? null,
      date: new Date().getTime(),
      path: request.url,
    };

    if (status >= 500) {
      this.logger.error(
        `[HTTP异常] ${request.method} ${request.url}`,
        exception.stack,
        'HTTP异常过滤器',
      );
    } else {
      this.logger.warn(
        `[HTTP异常] ${request.method} ${request.url} - ${status}${stableCode ? ` - ${stableCode}` : ''} - ${message}`,
        'HTTP异常过滤器',
      );
    }

    response
      .status(status)
      .header('Content-Type', 'application/json; charset=utf-8')
      .json(errorResponse);
  }
}

/** 最后一层兜底：详细错误只写日志，响应始终返回本地化安全文案。 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    // Multer reports an interrupted multipart upload as a plain Error. The
    // client has already gone away, so this is an expected transport event:
    // do not classify it as a server failure or try to write a JSON response
    // to a closed socket.
    if (isClientAbortException(exception, request)) {
      this.logger.log(
        `[客户端取消请求] ${request.method} ${request.url} - 请求体传输未完成`,
        '全局异常过滤器',
      );
      return;
    }

    const errorStatus =
      exception && typeof exception === 'object'
        ? (exception as { status?: unknown; statusCode?: unknown })
        : null;
    const status = normalizeHttpStatus(
      exception instanceof HttpException
        ? exception.getStatus()
        : (errorStatus?.status ?? errorStatus?.statusCode),
    );
    const rawMessage =
      exception instanceof Error ? exception.message : String(exception ?? '');
    const message = getSafeHttpMessage(status, rawMessage, null);
    const requestPath =
      typeof request.path === 'string'
        ? request.path
        : String(request.url ?? '').split('?', 1)[0];

    if (status >= 500) {
      this.logger.error(
        `[未捕获异常] ${rawMessage}`,
        exception instanceof Error ? exception.stack : null,
        '全局异常过滤器',
      );
    } else if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
      this.logger.warn(
        `[请求体过大] ${request.method} ${requestPath} - ${payloadTooLargeLogDetails(exception, request)}`,
        '全局异常过滤器',
      );
    } else {
      this.logger.warn(
        `[未捕获异常] ${request.method} ${request.url} - ${status} - ${message}`,
        '全局异常过滤器',
      );
    }

    response.status(status).json({
      code: status,
      message,
      data: null,
      date: new Date().getTime(),
      path: request.url,
    });
  }
}
