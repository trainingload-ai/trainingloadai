import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { StoragePathError } from './storage-path';

export type SelfHostStorageDiagnosticCode =
  | 'SELF_HOST_STORAGE_INVALID_PATH'
  | 'SELF_HOST_STORAGE_FILE_NOT_FOUND'
  | 'SELF_HOST_STORAGE_NOT_WRITABLE'
  | 'SELF_HOST_STORAGE_NO_SPACE'
  | 'SELF_HOST_STORAGE_IO_ERROR';

export function classifyStorageError(
  error: unknown,
): SelfHostStorageDiagnosticCode {
  if (error instanceof StoragePathError) {
    return 'SELF_HOST_STORAGE_INVALID_PATH';
  }
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') return 'SELF_HOST_STORAGE_FILE_NOT_FOUND';
  if (['EACCES', 'EPERM', 'EROFS'].includes(code ?? '')) {
    return 'SELF_HOST_STORAGE_NOT_WRITABLE';
  }
  if (['ENOSPC', 'EDQUOT'].includes(code ?? '')) {
    return 'SELF_HOST_STORAGE_NO_SPACE';
  }
  return 'SELF_HOST_STORAGE_IO_ERROR';
}

export function toStorageBusinessException(error: unknown): BusinessException {
  if (error instanceof BusinessException) return error;
  const diagnosticCode = classifyStorageError(error);
  const code =
    diagnosticCode === 'SELF_HOST_STORAGE_INVALID_PATH'
      ? BUSINESS_ERROR_CODE.STORAGE_INVALID_PATH
      : diagnosticCode === 'SELF_HOST_STORAGE_FILE_NOT_FOUND'
        ? BUSINESS_ERROR_CODE.STORAGE_FILE_NOT_FOUND
        : diagnosticCode === 'SELF_HOST_STORAGE_NOT_WRITABLE'
          ? BUSINESS_ERROR_CODE.STORAGE_NOT_WRITABLE
          : diagnosticCode === 'SELF_HOST_STORAGE_NO_SPACE'
            ? BUSINESS_ERROR_CODE.STORAGE_NO_SPACE
            : BUSINESS_ERROR_CODE.INTERNAL_SERVER_ERROR;
  return new BusinessException({ code, message: diagnosticCode });
}
