import { BadRequestException } from '@nestjs/common';
import { TrackSwapError } from 'trackswap';
import {
  TrackFileValidationError,
  type TrackFileFormat,
} from './trackswap-file';

export const TRACK_FILE_REQUEST_ERROR = {
  REQUIRED: 'TRACK_FILE_REQUIRED',
  SINGLE_REQUIRED: 'TRACK_FILE_SINGLE_REQUIRED',
  FORMAT_UNKNOWN: 'TRACK_FILE_FORMAT_UNKNOWN',
  FORMAT_MISMATCH: 'TRACK_FILE_FORMAT_MISMATCH',
  DECODE_FAILED: 'TRACK_FILE_DECODE_FAILED',
  ACTIVITY_REQUIRED: 'TRACK_FILE_ACTIVITY_REQUIRED',
  TCX_TIMESTAMPS_REQUIRED: 'TRACK_FILE_TCX_TIMESTAMPS_REQUIRED',
  TCX_LAPS_REQUIRED: 'TRACK_FILE_TCX_LAPS_REQUIRED',
  CONVERSION_FAILED: 'TRACK_FILE_CONVERSION_FAILED',
  RECORDS_REQUIRED: 'TRACK_FILE_RECORDS_REQUIRED',
  TIMESTAMPS_REQUIRED: 'TRACK_FILE_TIMESTAMPS_REQUIRED',
  POWER_REQUIRED: 'TRACK_FILE_POWER_REQUIRED',
  DISTANCE_REQUIRED: 'TRACK_FILE_DISTANCE_REQUIRED',
  DISTANCE_SEGMENT_REQUIRED: 'TRACK_FILE_DISTANCE_SEGMENT_REQUIRED',
  DURATION_TOO_SHORT: 'TRACK_FILE_DURATION_TOO_SHORT',
  POWER_WINDOW_REQUIRED: 'TRACK_FILE_POWER_WINDOW_REQUIRED',
  ESTIMATE_FAILED: 'TRACK_FILE_ESTIMATE_FAILED',
} as const;

export type TrackFileRequestErrorCode =
  (typeof TRACK_FILE_REQUEST_ERROR)[keyof typeof TRACK_FILE_REQUEST_ERROR];

type SuggestedAction =
  | 'SELECT_FILE'
  | 'SELECT_SINGLE_FILE'
  | 'SELECT_ANOTHER_FILE'
  | 'VERIFY_FILE_FORMAT'
  | 'ADD_TIMESTAMPS'
  | 'TRY_ANOTHER_OUTPUT_FORMAT'
  | 'SELECT_ACTIVITY_FILE'
  | 'SELECT_FILE_WITH_POWER'
  | 'SELECT_FILE_WITH_DISTANCE'
  | 'SELECT_LONGER_ACTIVITY';

type ErrorDefinition = {
  messageKey: string;
  suggestedAction: SuggestedAction;
};

const ERROR_DEFINITIONS: Record<TrackFileRequestErrorCode, ErrorDefinition> = {
  TRACK_FILE_REQUIRED: {
    messageKey: 'common.error.track_file_required',
    suggestedAction: 'SELECT_FILE',
  },
  TRACK_FILE_SINGLE_REQUIRED: {
    messageKey: 'common.error.track_file_single_required',
    suggestedAction: 'SELECT_SINGLE_FILE',
  },
  TRACK_FILE_FORMAT_UNKNOWN: {
    messageKey: 'common.error.track_file_format_unknown',
    suggestedAction: 'SELECT_ANOTHER_FILE',
  },
  TRACK_FILE_FORMAT_MISMATCH: {
    messageKey: 'common.error.track_file_format_mismatch',
    suggestedAction: 'VERIFY_FILE_FORMAT',
  },
  TRACK_FILE_DECODE_FAILED: {
    messageKey: 'common.error.track_file_decode_failed',
    suggestedAction: 'SELECT_ANOTHER_FILE',
  },
  TRACK_FILE_ACTIVITY_REQUIRED: {
    messageKey: 'common.error.track_file_activity_required',
    suggestedAction: 'SELECT_ACTIVITY_FILE',
  },
  TRACK_FILE_TCX_TIMESTAMPS_REQUIRED: {
    messageKey: 'common.error.track_file_tcx_timestamps_required',
    suggestedAction: 'ADD_TIMESTAMPS',
  },
  TRACK_FILE_TCX_LAPS_REQUIRED: {
    messageKey: 'common.error.track_file_tcx_laps_required',
    suggestedAction: 'SELECT_ACTIVITY_FILE',
  },
  TRACK_FILE_CONVERSION_FAILED: {
    messageKey: 'common.error.track_file_conversion_failed',
    suggestedAction: 'TRY_ANOTHER_OUTPUT_FORMAT',
  },
  TRACK_FILE_RECORDS_REQUIRED: {
    messageKey: 'common.error.track_file_records_required',
    suggestedAction: 'SELECT_ACTIVITY_FILE',
  },
  TRACK_FILE_TIMESTAMPS_REQUIRED: {
    messageKey: 'common.error.track_file_timestamps_required',
    suggestedAction: 'ADD_TIMESTAMPS',
  },
  TRACK_FILE_POWER_REQUIRED: {
    messageKey: 'common.error.track_file_power_required',
    suggestedAction: 'SELECT_FILE_WITH_POWER',
  },
  TRACK_FILE_DISTANCE_REQUIRED: {
    messageKey: 'common.error.track_file_distance_required',
    suggestedAction: 'SELECT_FILE_WITH_DISTANCE',
  },
  TRACK_FILE_DISTANCE_SEGMENT_REQUIRED: {
    messageKey: 'common.error.track_file_distance_segment_required',
    suggestedAction: 'SELECT_LONGER_ACTIVITY',
  },
  TRACK_FILE_DURATION_TOO_SHORT: {
    messageKey: 'common.error.track_file_duration_too_short',
    suggestedAction: 'SELECT_LONGER_ACTIVITY',
  },
  TRACK_FILE_POWER_WINDOW_REQUIRED: {
    messageKey: 'common.error.track_file_power_window_required',
    suggestedAction: 'SELECT_LONGER_ACTIVITY',
  },
  TRACK_FILE_ESTIMATE_FAILED: {
    messageKey: 'common.error.track_file_estimate_failed',
    suggestedAction: 'SELECT_ANOTHER_FILE',
  },
};

type TrackFileErrorOptions = {
  data?: Record<string, unknown>;
  messageArgs?: Record<string, unknown>;
  origin?: 'REQUEST' | 'UPLOADED_FILE';
};

/**
 * Public 文件工具的稳定错误契约。
 *
 * `origin` 用于让客户端区分上传文件问题与服务故障；这里的异常均为可确认的
 * 4xx 输入问题，未知异常不得包装为此类型。
 */
export function trackFileBadRequest(
  code: TrackFileRequestErrorCode,
  options: TrackFileErrorOptions = {},
): BadRequestException {
  const definition = ERROR_DEFINITIONS[code];
  return new BadRequestException({
    code,
    messageKey: definition.messageKey,
    ...(options.messageArgs ? { messageArgs: options.messageArgs } : {}),
    data: {
      category: 'FILE_INPUT',
      origin: options.origin ?? 'UPLOADED_FILE',
      retryable: false,
      suggestedAction: definition.suggestedAction,
      ...options.data,
    },
  });
}

type TrackFileMappingContext = {
  expectedFormat?: TrackFileFormat;
  filename?: string;
  targetFormat?: TrackFileFormat;
};

/**
 * 仅映射能明确归因于上传文件或请求选择的 TrackSwap 错误。
 * 返回 null 表示异常来源不确定，应继续作为服务端异常处理。
 */
export function mapTrackFileRequestError(
  error: unknown,
  context: TrackFileMappingContext = {},
): BadRequestException | null {
  if (error instanceof TrackFileValidationError) {
    if (error.code === 'FORMAT_MISMATCH') {
      const expectedFormat =
        error.details.expectedFormat ?? context.expectedFormat;
      const detectedFormat = error.details.detectedFormat;
      return trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.FORMAT_MISMATCH, {
        data: {
          detectedFormat,
          expectedFormat,
          filename: error.details.filename ?? context.filename,
        },
        messageArgs: {
          detectedFormat: detectedFormat?.toUpperCase() ?? '?',
          expectedFormat: expectedFormat?.toUpperCase() ?? '?',
        },
      });
    }
    if (error.code === 'ACTIVITY_NOT_FOUND') {
      return trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.ACTIVITY_REQUIRED, {
        data: {
          filename: error.details.filename ?? context.filename,
        },
      });
    }
  }

  if (!(error instanceof TrackSwapError)) return null;

  const commonData = {
    filename: context.filename,
    sourceFormat: error.format,
    targetFormat: context.targetFormat,
  };
  if (error.code === 'FORMAT_UNKNOWN') {
    return trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.FORMAT_UNKNOWN, {
      data: commonData,
    });
  }
  if (error.code === 'DECODE_FAILED') {
    return trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.DECODE_FAILED, {
      data: commonData,
    });
  }
  if (error.code === 'ACTIVITY_NOT_FOUND') {
    return trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.ACTIVITY_REQUIRED, {
      data: commonData,
    });
  }
  if (error.code === 'ENCODE_FAILED') {
    if (
      error.format === 'tcx' &&
      /without valid timestamps/i.test(error.message)
    ) {
      return trackFileBadRequest(
        TRACK_FILE_REQUEST_ERROR.TCX_TIMESTAMPS_REQUIRED,
        { data: commonData },
      );
    }
    if (
      error.format === 'tcx' &&
      /TCX activity without laps/i.test(error.message)
    ) {
      return trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.TCX_LAPS_REQUIRED, {
        data: commonData,
      });
    }
    return trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.CONVERSION_FAILED, {
      data: commonData,
    });
  }

  return null;
}
