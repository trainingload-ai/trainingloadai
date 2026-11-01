import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request = require('supertest');
import { ActivityService } from '@/api/activity/activity.service';
import {
  AllExceptionsFilter,
  HttpExceptionFilter,
} from '@/filters/http-exception/http-exception.filter';
import { PublicController } from '../public.controller';
import { PublicService } from '../public.service';
import { PUBLIC_TRACK_FILE_MAX_BYTES } from '../public-upload-limits';
import { TRACK_FILE_CONVERSION_REPORT_HEADER } from '@shared/track-file-contract';
import { HeaderResolver, I18nModule } from 'nestjs-i18n';
import { resolve } from 'node:path';
import { TrackFileConversionError } from '@/importing/track-file-conversion';
import { mapTrackFileRequestError } from '@/importing/track-file-request-error';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

describe('PublicController upload limits', () => {
  let app: INestApplication;
  const inspectActivityFile = jest
    .fn<() => Promise<{ format: string }>>()
    .mockResolvedValue({ format: 'fit' });
  const conversionReport = {
    version: 1,
    targetFormat: 'gpx',
    files: [
      {
        sourceFormat: 'fit',
        inputRecords: 2,
        outputRecords: 1,
        warnings: [{ code: 'POINTS_OMITTED', count: 1, total: 2 }],
      },
    ],
  };
  const convertFiles = jest.fn<() => Promise<unknown>>().mockResolvedValue({
    type: 'file',
    filename: 'converted.gpx',
    content: Buffer.from('<gpx/>'),
    sourceFormats: ['fit'],
    report: conversionReport,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        I18nModule.forRoot({
          fallbackLanguage: 'en',
          loaderOptions: {
            path: resolve(
              __dirname,
              '../../../../../../packages/messages/server',
            ),
            watch: false,
          },
          resolvers: [new HeaderResolver(['x-lang'])],
        }),
      ],
      controllers: [PublicController],
      providers: [
        {
          provide: PublicService,
          useValue: { inspectActivityFile },
        },
        {
          provide: ActivityService,
          useValue: { convertFiles },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(
      new AllExceptionsFilter(new Logger()),
      new HttpExceptionFilter(new Logger()),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an oversized inspection file before calling the decoder', async () => {
    await request(app.getHttpServer())
      .post('/public/inspect-activity-file')
      .set('x-lang', 'zh')
      .attach(
        'file',
        Buffer.alloc(PUBLIC_TRACK_FILE_MAX_BYTES + 1),
        'oversized.fit',
      )
      .expect(413)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: 413,
          message: '上传的文件过大。',
        });
      });

    expect(inspectActivityFile).not.toHaveBeenCalled();
  });

  it('returns the conversion report with the binary file and exposes it across origins', async () => {
    await request(app.getHttpServer())
      .post('/public/convert')
      .field('type', 'gpx')
      .attach('files', Buffer.from('synthetic input'), 'activity.fit')
      .expect(201)
      .expect(({ headers }) => {
        expect(
          JSON.parse(
            headers[TRACK_FILE_CONVERSION_REPORT_HEADER.toLowerCase()],
          ),
        ).toEqual(conversionReport);
        expect(headers['access-control-expose-headers']).toContain(
          TRACK_FILE_CONVERSION_REPORT_HEADER,
        );
      });
  });

  it('localizes a converter failure using x-lang and keeps its stable error code', async () => {
    convertFiles.mockRejectedValueOnce(
      mapTrackFileRequestError(
        new TrackFileConversionError(
          'OUTPUT_INVALID',
          'private encoder details',
        ),
      ),
    );
    await request(app.getHttpServer())
      .post('/public/convert')
      .set('x-lang', 'fr')
      .field('type', 'gpx')
      .attach('files', Buffer.from('synthetic input'), 'activity.fit')
      .expect(500)
      .expect(({ body }) => {
        expect(body.error_code).toBe('TRACK_FILE_OUTPUT_INVALID');
        expect(body.message).toBe(
          'Le fichier converti n’a pas réussi la validation et son téléchargement a été bloqué. Conservez l’original et essayez un autre format ou contactez l’assistance.',
        );
        expect(body.message).not.toContain('private');
      });
  });
});
