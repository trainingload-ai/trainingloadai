import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  type INestApplication,
  Post,
  Req,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import { json, type Request } from 'express';
import request = require('supertest');
import {
  INTERVALS_ICU_WEBHOOK_MAX_BYTES,
  INTERVALS_ICU_WEBHOOK_PATH,
  registerIntervalsIcuWebhookBodyParser,
} from '../intervals-icu-webhook-body-parser';

type RequestWithRawBody = Request & { rawBody?: Buffer };

@Controller()
class BodyParserProbeController {
  @Post('intervals-icu/webhook/callback')
  @HttpCode(HttpStatus.OK)
  intervals(@Body() body: unknown, @Req() request: RequestWithRawBody) {
    return {
      body,
      rawChecksum: createHash('sha256')
        .update(request.rawBody ?? Buffer.alloc(0))
        .digest('hex'),
    };
  }

  @Post('ordinary-json')
  @HttpCode(HttpStatus.OK)
  ordinary(@Body() body: unknown) {
    return { body };
  }
}

describe('Intervals.icu webhook body parser', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BodyParserProbeController],
    }).compile();
    const expressApp = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });

    registerIntervalsIcuWebhookBodyParser(expressApp);
    // Mirrors the 100 KiB JSON parser that AuthModule registers afterwards.
    expressApp.use(json({ limit: 100 * 1024 }));
    await expressApp.init();
    app = expressApp;
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a webhook above the default JSON limit and preserves raw bytes', async () => {
    const payload = { events: [], padding: 'x'.repeat(110 * 1024) };
    const rawBody = JSON.stringify(payload);

    const response = await request(app.getHttpServer())
      .post(INTERVALS_ICU_WEBHOOK_PATH)
      .set('Content-Type', 'application/json')
      .send(rawBody)
      .expect(HttpStatus.OK);

    expect(response.body.body).toEqual(payload);
    expect(response.body.rawChecksum).toBe(
      createHash('sha256').update(rawBody).digest('hex'),
    );
  });

  it('keeps the default JSON limit for unrelated routes', async () => {
    await request(app.getHttpServer())
      .post('/ordinary-json')
      .send({ padding: 'x'.repeat(110 * 1024) })
      .expect(HttpStatus.PAYLOAD_TOO_LARGE);
  });

  it('still rejects an Intervals.icu webhook above the dedicated limit', async () => {
    await request(app.getHttpServer())
      .post(INTERVALS_ICU_WEBHOOK_PATH)
      .send({ padding: 'x'.repeat(INTERVALS_ICU_WEBHOOK_MAX_BYTES) })
      .expect(HttpStatus.PAYLOAD_TOO_LARGE);
  });
});
