import { HttpStatus } from '@nestjs/common';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { I18nContext } from 'nestjs-i18n';
import {
  AllExceptionsFilter,
  getSafeHttpMessage,
  HttpExceptionFilter,
  normalizeHttpStatus,
} from '../http-exception/http-exception.filter';
import {
  TRACK_FILE_REQUEST_ERROR,
  trackFileBadRequest,
} from '@/importing/track-file-request-error';

const zhMessages: Record<string, string> = {
  'common.error.internal': '系统内部错误，请稍后重试。',
  'common.error.invalid_request': '请求参数不合法',
  'common.error.payload_too_large': '上传的文件过大。',
  'common.error.unprocessable_entity': '无法处理该请求',
  'common.error.workout_definition_invalid': '训练定义不合法',
  'common.error.account_deletion_in_progress': '账户删除申请正在处理中',
  'common.error.track_file_tcx_timestamps_required':
    '无法转换为 TCX：源文件缺少有效的活动或轨迹点时间。',
};

function mockI18n(lang: 'en' | 'zh') {
  const translations = {
    en: {
      common: {
        error: {
          invalid_request: 'Invalid request parameters',
          user_not_found: 'User not found',
        },
      },
    },
    zh: {
      common: {
        error: {
          invalid_request: '请求参数不合法',
          user_not_found: '用户不存在',
        },
      },
    },
  };
  jest.spyOn(I18nContext, 'current').mockReturnValue({
    lang,
    t: (key: string) => (lang === 'zh' ? (zhMessages[key] ?? key) : key),
    service: {
      getTranslations: () => translations,
      resolveLanguage: (value: string) => value,
    },
  } as never);
}

describe('getSafeHttpMessage', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not expose an unlocalized validation message to Chinese clients', () => {
    mockI18n('zh');

    expect(
      getSafeHttpMessage(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Exercise name cannot be empty',
        null,
      ),
    ).toBe('无法处理该请求');
  });

  it('localizes oversized upload errors', () => {
    mockI18n('zh');

    expect(
      getSafeHttpMessage(HttpStatus.PAYLOAD_TOO_LARGE, 'File too large', null),
    ).toBe('上传的文件过大。');
  });

  it('translates a stable structured error code', () => {
    mockI18n('zh');

    expect(
      getSafeHttpMessage(HttpStatus.UNPROCESSABLE_ENTITY, 'raw detail', {
        code: 'WORKOUT_DEFINITION_INVALID',
      }),
    ).toBe('训练定义不合法');
  });

  it('translates a specific TCX timestamp validation message', () => {
    mockI18n('zh');

    expect(
      getSafeHttpMessage(HttpStatus.BAD_REQUEST, undefined, {
        code: 'TRACK_FILE_TCX_TIMESTAMPS_REQUIRED',
        messageKey: 'common.error.track_file_tcx_timestamps_required',
      }),
    ).toBe('无法转换为 TCX：源文件缺少有效的活动或轨迹点时间。');
  });

  it('translates an account deletion code and keeps the code for clients', () => {
    mockI18n('zh');

    expect(
      getSafeHttpMessage(HttpStatus.CONFLICT, 'ACCOUNT_DELETION_IN_PROGRESS', {
        code: 'ACCOUNT_DELETION_IN_PROGRESS',
      }),
    ).toBe('账户删除申请正在处理中');
  });

  it('preserves a message that is already translated for the active locale', () => {
    mockI18n('zh');

    expect(getSafeHttpMessage(HttpStatus.NOT_FOUND, '用户不存在', null)).toBe(
      '用户不存在',
    );
  });

  it('always hides internal exception details', () => {
    mockI18n('zh');

    expect(
      getSafeHttpMessage(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'database password leaked',
        null,
      ),
    ).toBe('系统内部错误，请稍后重试。');
  });

  it('keeps English details for English clients', () => {
    mockI18n('en');

    expect(
      getSafeHttpMessage(
        HttpStatus.BAD_REQUEST,
        'windowEnd must be after windowStart',
        null,
      ),
    ).toBe('windowEnd must be after windowStart');
  });
});

describe('normalizeHttpStatus', () => {
  it.each([400, 401, 429, 500, 599])(
    'keeps valid HTTP error status %s',
    (status) => {
      expect(normalizeHttpStatus(status)).toBe(status);
    },
  );

  it.each([undefined, null, '500', 200, 399, 600, Number.NaN, 500.5])(
    'turns unsafe status %p into 500',
    (status) => {
      expect(normalizeHttpStatus(status)).toBe(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    },
  );
});

describe('HttpExceptionFilter public file contract', () => {
  afterEach(() => jest.restoreAllMocks());

  it('preserves the stable error code and safe action metadata', () => {
    mockI18n('zh');
    const json = jest.fn();
    const response = {
      header: jest.fn().mockReturnThis(),
      json,
      status: jest.fn().mockReturnThis(),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', url: '/public/convert' }),
        getResponse: () => response,
      }),
    };
    const logger = {
      error: jest.fn(),
      warn: jest.fn(),
    };

    new HttpExceptionFilter(logger as never).catch(
      trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.TCX_TIMESTAMPS_REQUIRED),
      host as never,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 400,
        data: expect.objectContaining({
          category: 'FILE_INPUT',
          origin: 'UPLOADED_FILE',
          suggestedAction: 'ADD_TIMESTAMPS',
        }),
        error_code: 'TRACK_FILE_TCX_TIMESTAMPS_REQUIRED',
        errorCode: 'TRACK_FILE_TCX_TIMESTAMPS_REQUIRED',
        message: '无法转换为 TCX：源文件缺少有效的活动或轨迹点时间。',
      }),
    );
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('TRACK_FILE_TCX_TIMESTAMPS_REQUIRED'),
      'HTTP异常过滤器',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('AllExceptionsFilter client abort handling', () => {
  it.each(['Request aborted', 'Request closed'])(
    'logs an interrupted upload without reporting a server error: %s',
    (message) => {
      const response = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };
      const host = {
        switchToHttp: () => ({
          getRequest: () => ({
            aborted: true,
            method: 'POST',
            url: '/public/inspect-activity-file',
          }),
          getResponse: () => response,
        }),
      };
      const logger = {
        error: jest.fn(),
        log: jest.fn(),
        warn: jest.fn(),
      };

      new AllExceptionsFilter(logger as never).catch(
        new Error(message),
        host as never,
      );

      expect(logger.log).toHaveBeenCalledWith(
        '[客户端取消请求] POST /public/inspect-activity-file - 请求体传输未完成',
        '全局异常过滤器',
      );
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(response.status).not.toHaveBeenCalled();
      expect(response.json).not.toHaveBeenCalled();
    },
  );

  it('keeps a similarly named application error as a server error', () => {
    const response = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          aborted: false,
          method: 'POST',
          url: '/public/inspect-activity-file',
        }),
        getResponse: () => response,
      }),
    };
    const logger = {
      error: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
    };

    new AllExceptionsFilter(logger as never).catch(
      new Error('Request aborted'),
      host as never,
    );

    expect(logger.error).toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalled();
  });

  it('logs parser size metadata for 413 without exposing the request body', () => {
    const response = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          body: { secret: 'must-not-appear' },
          get: (name: string) =>
            name === 'content-length' ? '112640' : undefined,
          headers: { 'content-length': '112640' },
          method: 'POST',
          url: '/intervals-icu/webhook/callback?secret=query-secret',
        }),
        getResponse: () => response,
      }),
    };
    const logger = {
      error: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
    };
    const exception = Object.assign(new Error('request entity too large'), {
      length: 112640,
      limit: 102400,
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      type: 'entity.too.large',
    });

    new AllExceptionsFilter(logger as never).catch(exception, host as never);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    const output = logger.warn.mock.calls.flat().join(' ');
    expect(output).toContain('[请求体过大]');
    expect(output).toContain('declaredBodyBytes=112640');
    expect(output).toContain('length=112640');
    expect(output).toContain('limit=102400');
    expect(output).toContain('type=entity.too.large');
    expect(output).not.toContain('must-not-appear');
    expect(output).not.toContain('query-secret');
    expect(logger.error).not.toHaveBeenCalled();
  });
});
