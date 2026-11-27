import type { PrismaTx } from '@/prisma/prisma-db';

export const ACCOUNT_DELETION_LOCAL_DATA = Symbol(
  'ACCOUNT_DELETION_LOCAL_DATA',
);

/** Deployment hooks for data stored outside Core. */
export interface AccountDeletionLocalData {
  revokeLocalCredentials(args: {
    tx: PrismaTx;
    userId: string;
    requestedAt: Date;
  }): Promise<void>;

  listPrivateStorageKeys?(args: { tx: PrismaTx; userId: string }): Promise<string[]>;

  beforeUserDeletion(args: {
    tx: PrismaTx;
    userId: string;
  }): Promise<void>;
}
