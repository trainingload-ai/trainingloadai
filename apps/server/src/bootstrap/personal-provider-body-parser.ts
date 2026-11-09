import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';

export const PERSONAL_PROVIDER_PREVIEW_PATH = '/api/coros-mcp/operations/preview';
export const PERSONAL_PROVIDER_MAX_BYTES = 2 * 1024 * 1024;

/** Plans and route XML need more than the default 100 KiB; keep the exception local. */
export function registerPersonalProviderBodyParser(app: NestExpressApplication) {
  app.use(PERSONAL_PROVIDER_PREVIEW_PATH, json({ limit: PERSONAL_PROVIDER_MAX_BYTES }));
}
