import { describe, expect, it } from '@jest/globals';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { StoragePathError } from '../storage-path';
import {
  classifyStorageError,
  toStorageBusinessException,
} from '../storage-error';

function errno(code: string) {
  return Object.assign(new Error(code), { code });
}

describe('self-host storage error contract', () => {
  it.each([
    [new StoragePathError('unsafe'), 'SELF_HOST_STORAGE_INVALID_PATH'],
    [errno('ENOENT'), 'SELF_HOST_STORAGE_FILE_NOT_FOUND'],
    [errno('EACCES'), 'SELF_HOST_STORAGE_NOT_WRITABLE'],
    [errno('EROFS'), 'SELF_HOST_STORAGE_NOT_WRITABLE'],
    [errno('ENOSPC'), 'SELF_HOST_STORAGE_NO_SPACE'],
    [errno('EDQUOT'), 'SELF_HOST_STORAGE_NO_SPACE'],
    [errno('EIO'), 'SELF_HOST_STORAGE_IO_ERROR'],
  ])('classifies %p as %s', (error, expected) => {
    expect(classifyStorageError(error)).toBe(expected);
  });

  it.each([
    [errno('EACCES'), BUSINESS_ERROR_CODE.STORAGE_NOT_WRITABLE],
    [errno('EROFS'), BUSINESS_ERROR_CODE.STORAGE_NOT_WRITABLE],
    [errno('ENOSPC'), BUSINESS_ERROR_CODE.STORAGE_NO_SPACE],
  ])('maps filesystem failures to a stable API code', (error, expected) => {
    expect(toStorageBusinessException(error).getResponse()).toMatchObject({
      code: expected,
    });
  });
});
