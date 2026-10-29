import type { PrismaTx } from '@/prisma/prisma-db';

export const ACCOUNT_DELETION_LOCAL_DATA = Symbol(
  'ACCOUNT_DELETION_LOCAL_DATA',
);

/** Optional deployment hook for revoking credentials stored outside Core. */
export interface AccountDeletionLocalData {
  revokeLocalCredentials(args: {
    tx: PrismaTx;
    userId: string;
    requestedAt: Date;
  }): Promise<void>;

  beforeUserDeletion(args: {
    tx: PrismaTx;
    userId: string;
  }): Promise<void>;
}
