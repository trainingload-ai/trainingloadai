import type { NestExpressApplication } from '@nestjs/platform-express';

export const MANAGED_STARTUP = Symbol('MANAGED_STARTUP');

export interface ManagedStartup {
  /** Register deployment middleware before Nest initializes module parsers. */
  configureHttpMiddleware?(app: NestExpressApplication): void;
  initializeRemoteWebhooks(): Promise<void>;
}
