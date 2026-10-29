/** Secret-at-rest operations required by user-owned integration adapters. */
export interface CredentialVault {
  encrypt(plainText: string): string;
  decrypt(encoded: string): string;
  last4(value: string): string;
  fingerprint(value: string): string;
}

export const CREDENTIAL_VAULT = Symbol('CREDENTIAL_VAULT');
