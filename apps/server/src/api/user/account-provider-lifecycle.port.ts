export const ACCOUNT_PROVIDER_CLEANUP = Symbol('ACCOUNT_PROVIDER_CLEANUP');
export const EXTERNAL_ACCOUNT_DISCONNECT = Symbol(
  'EXTERNAL_ACCOUNT_DISCONNECT',
);

export interface AccountProviderCleanup {
  revokeAndDisconnect(userId: string, subjectHash: string): Promise<void>;
}

export interface ExternalAccountDisconnect {
  disconnect(
    provider: string,
    userId: string,
    authAccountId: string,
  ): Promise<void>;
}
