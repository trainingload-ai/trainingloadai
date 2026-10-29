import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';
import { PublicService } from '../public.service';

function uploadedFile(content: string, name = 'activity.dat') {
  return {
    buffer: Buffer.from(content),
    originalname: name,
  } as Express.Multer.File;
}

function errorCode(error: unknown) {
  expect(error).toBeInstanceOf(BadRequestException);
  return (error as BadRequestException).getResponse() as {
    code: string;
    data: Record<string, unknown>;
  };
}

describe('PublicService file errors', () => {
  const service = new PublicService(
    {
      t: (key: string) => key,
    } as never,
    {} as never,
  );

  it('returns a stable request error when no inspection file is uploaded', async () => {
    const error = await service
      .inspectActivityFile(undefined as never)
      .catch((reason: unknown) => reason);

    expect(errorCode(error)).toMatchObject({
      code: 'TRACK_FILE_REQUIRED',
      data: {
        category: 'FILE_INPUT',
        origin: 'REQUEST',
      },
    });
  });

  it('classifies an unrecognized inspection file without exposing parser details', async () => {
    const error = await service
      .inspectActivityFile(uploadedFile('not a track file'))
      .catch((reason: unknown) => reason);

    expect(errorCode(error)).toMatchObject({
      code: 'TRACK_FILE_FORMAT_UNKNOWN',
      data: {
        category: 'FILE_INPUT',
        filename: 'activity.dat',
        origin: 'UPLOADED_FILE',
      },
    });
  });

  it('uses the same file contract for FIT course encoding', async () => {
    const error = await service
      .encodeFITCourseFromFile(uploadedFile('not a track file'))
      .catch((reason: unknown) => reason);

    expect(errorCode(error)).toMatchObject({
      code: 'TRACK_FILE_FORMAT_UNKNOWN',
      data: {
        targetFormat: 'fit',
      },
    });
  });
});
