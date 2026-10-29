import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, type Request } from 'express';

export const INTERVALS_ICU_WEBHOOK_PATH = '/intervals-icu/webhook/callback';
export const INTERVALS_ICU_WEBHOOK_MAX_BYTES = 1024 * 1024;

type RequestWithRawBody = Request & { rawBody?: Buffer };

/**
 * Intervals.icu can send calendar/activity payloads larger than Express' default
 * 100 KiB JSON limit. Parse only this route with a larger bounded limit before
 * Better Auth re-adds the default parser for the rest of the application.
 */
export function registerIntervalsIcuWebhookBodyParser(
  app: NestExpressApplication,
): void {
  app.use(
    INTERVALS_ICU_WEBHOOK_PATH,
    json({
      limit: INTERVALS_ICU_WEBHOOK_MAX_BYTES,
      verify: (request, _response, buffer) => {
        (request as RequestWithRawBody).rawBody = Buffer.from(buffer);
      },
    }),
  );
}
