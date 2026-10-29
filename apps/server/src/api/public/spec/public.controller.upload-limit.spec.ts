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

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

describe('PublicController upload limits', () => {
  let app: INestApplication;
  const inspectActivityFile = jest
    .fn<() => Promise<{ format: string }>>()
    .mockResolvedValue({ format: 'fit' });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [
        {
          provide: PublicService,
          useValue: { inspectActivityFile },
        },
        {
          provide: ActivityService,
          useValue: {},
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
      .attach(
        'file',
        Buffer.alloc(PUBLIC_TRACK_FILE_MAX_BYTES + 1),
        'oversized.fit',
      )
      .expect(413)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: 413,
          message: 'The uploaded file is too large.',
        });
      });

    expect(inspectActivityFile).not.toHaveBeenCalled();
  });
});
