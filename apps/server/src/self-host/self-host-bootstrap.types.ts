export const SELF_HOST_INSTANCE_ID = 1;
export const SELF_HOST_BOOTSTRAP_TOKEN_FILE = 'bootstrap-token';

export type SelfHostBootstrapState = 'PENDING' | 'READY';

export type SelfHostBootstrapStatus = {
  schemaVersion: 1;
  state: SelfHostBootstrapState;
  bootstrapRequired: boolean;
  accessMode: 'local-owner' | 'credentials';
  browserSetupAvailable: boolean;
  tokenExpiresAt: string | null;
  mailRecoveryAvailable: boolean;
};

export type SelfHostSessionPolicy = {
  schemaVersion: 1;
  accessMode: 'local-owner' | 'credentials';
  isOwner: boolean;
  canSignOut: boolean;
  canDeleteAccount: boolean;
};

export type BootstrapOwnerInput = {
  token: string;
  email: string;
  password: string;
  name: string;
};

export type BootstrapLocalOwnerInput = {
  name: string;
};

export type BootstrapOwnerResult = {
  schemaVersion: 1;
  state: 'READY';
  owner: { email: string; name: string };
  initializedAt: string;
};

export type BootstrapLocalOwnerResult = {
  schemaVersion: 1;
  state: 'READY';
  accessMode: 'local-owner';
  owner: { name: string };
  initializedAt: string;
};

export type SelfHostBootstrapErrorCode =
  | 'SELF_HOST_ONLY'
  | 'SELF_HOST_ALREADY_INITIALIZED'
  | 'SELF_HOST_BOOTSTRAP_TOKEN_INVALID'
  | 'SELF_HOST_BOOTSTRAP_TOKEN_EXPIRED'
  | 'SELF_HOST_BOOTSTRAP_EMAIL_IN_USE'
  | 'SELF_HOST_LOCAL_ACCESS_DISABLED'
  | 'SELF_HOST_LOCAL_ACCESS_FORBIDDEN'
  | 'SELF_HOST_BOOTSTRAP_INPUT_INVALID';

export class SelfHostBootstrapError extends Error {
  constructor(readonly code: SelfHostBootstrapErrorCode) {
    super(code);
    this.name = 'SelfHostBootstrapError';
  }
}
