import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';

export const PLAN_MAX_BYTES = 2 * 1024 * 1024;

/** Multi-week plans include notes and structures; parse them before the default auth parser. */
export function registerPlanBodyParser(app: NestExpressApplication): void {
  app.use('/plans', json({ limit: PLAN_MAX_BYTES }));
}
