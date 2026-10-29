export const MANAGED_STARTUP = Symbol('MANAGED_STARTUP');

export interface ManagedStartup {
  initializeRemoteWebhooks(): Promise<void>;
}
