export const ACCOUNT_DELETION_OBLIGATIONS = Symbol(
  'ACCOUNT_DELETION_OBLIGATIONS',
);

export type AccountDeletionSnapshotJson =
  | null
  | boolean
  | number
  | string
  | AccountDeletionSnapshotJson[]
  | { [key: string]: AccountDeletionSnapshotJson };

export type AccountDeletionObligationPreview = Record<
  string,
  AccountDeletionSnapshotJson
>;

export type AccountDeletionPreparationResult = Record<
  string,
  AccountDeletionSnapshotJson
>;

export interface AccountDeletionObligations {
  preview(userId: string): Promise<AccountDeletionObligationPreview>;
  prepareDeletion(userId: string): Promise<AccountDeletionPreparationResult>;
  assertDeletionAllowed(userId: string): Promise<void>;
  deleteRemoteIdentity(userId: string, subjectHash: string): Promise<void>;
  snapshot(userId: string): Promise<AccountDeletionSnapshotJson>;
}
