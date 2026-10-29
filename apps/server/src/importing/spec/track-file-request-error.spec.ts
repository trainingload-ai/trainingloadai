import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { TrackSwapError } from 'trackswap';
import {
  mapTrackFileRequestError,
  TRACK_FILE_REQUEST_ERROR,
  trackFileBadRequest,
} from '../track-file-request-error';
import {
  TrackFileValidationError,
  transcodeTrackFile,
} from '../trackswap-file';

function exceptionResponse(error: { getResponse(): string | object }) {
  return error.getResponse() as {
    code: string;
    data: Record<string, unknown>;
    messageArgs?: Record<string, unknown>;
    messageKey: string;
  };
}

describe('track file request errors', () => {
  it('marks a missing upload as a request problem with a stable contract', () => {
    const response = exceptionResponse(
      trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.REQUIRED, {
        origin: 'REQUEST',
      }),
    );

    expect(response).toMatchObject({
      code: 'TRACK_FILE_REQUIRED',
      data: {
        category: 'FILE_INPUT',
        origin: 'REQUEST',
        retryable: false,
        suggestedAction: 'SELECT_FILE',
      },
      messageKey: 'common.error.track_file_required',
    });
  });

  it('maps a selected source format mismatch without exposing parser text', () => {
    const mapped = mapTrackFileRequestError(
      new TrackFileValidationError('FORMAT_MISMATCH', 'raw parser detail', {
        detectedFormat: 'gpx',
        expectedFormat: 'fit',
        filename: 'ride.fit',
      }),
    );

    expect(mapped).not.toBeNull();
    expect(exceptionResponse(mapped!)).toMatchObject({
      code: 'TRACK_FILE_FORMAT_MISMATCH',
      data: {
        detectedFormat: 'gpx',
        expectedFormat: 'fit',
        filename: 'ride.fit',
        origin: 'UPLOADED_FILE',
      },
      messageArgs: {
        detectedFormat: 'GPX',
        expectedFormat: 'FIT',
      },
    });
  });

  it('maps a TCX conversion with missing timestamps to a user-facing file error', async () => {
    const input = Buffer.from(
      [
        '<gpx version="1.1" creator="server-test">',
        '<trk><trkseg><trkpt lat="31.2" lon="121.4" /></trkseg></trk>',
        '</gpx>',
      ].join(''),
    );
    const original = await transcodeTrackFile(input, 'tcx').catch(
      (reason: unknown) => reason,
    );
    const mapped = mapTrackFileRequestError(original, {
      filename: 'activity.gpx',
      targetFormat: 'tcx',
    });

    expect(mapped).not.toBeNull();
    expect(exceptionResponse(mapped!)).toMatchObject({
      code: 'TRACK_FILE_TCX_TIMESTAMPS_REQUIRED',
      data: {
        filename: 'activity.gpx',
        origin: 'UPLOADED_FILE',
        targetFormat: 'tcx',
      },
    });
  });

  it('does not mislabel internal TrackSwap lifecycle failures as file errors', () => {
    const mapped = mapTrackFileRequestError(
      new TrackSwapError('DISPOSED', 'TrackSwap instance is disposed'),
    );

    expect(mapped).toBeNull();
  });

  it('does not mislabel unknown application errors as file errors', () => {
    expect(mapTrackFileRequestError(new Error('database unavailable'))).toBe(
      null,
    );
  });

  it('has a user-facing message in every supported server locale', () => {
    const locales = [
      'de',
      'en',
      'es',
      'fr',
      'it',
      'ja',
      'ko',
      'pt-BR',
      'zh',
      'zh-hant',
    ];

    for (const locale of locales) {
      const messages = JSON.parse(
        readFileSync(
          resolve(
            __dirname,
            `../../../../../packages/messages/server/${locale}/common.json`,
          ),
          'utf8',
        ),
      ) as { error: Record<string, unknown> };

      for (const code of Object.values(TRACK_FILE_REQUEST_ERROR)) {
        const response = exceptionResponse(trackFileBadRequest(code));
        const key = response.messageKey.replace(/^common\.error\./, '');
        expect(messages.error[key]).toEqual(expect.any(String));
        expect((messages.error[key] as string).trim()).not.toBe('');
      }
    }
  });
});
