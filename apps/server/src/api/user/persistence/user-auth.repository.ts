export type AccountDeletionLookup = {
  t_user: {
    findUnique(args: {
      where: { email: string } | { id: string };
      select: { accountDeletionRequestedAt: true };
    }): Promise<{ accountDeletionRequestedAt: Date | null } | null>;
  };
};

const ACCOUNT_DELETION_SELECT = {
  accountDeletionRequestedAt: true,
} as const;

export function findAccountDeletionStateByEmail(
  prisma: AccountDeletionLookup,
  email: string,
) {
  return prisma.t_user.findUnique({
    where: { email },
    select: ACCOUNT_DELETION_SELECT,
  });
}

export function findAccountDeletionStateById(
  prisma: AccountDeletionLookup,
  id: string,
) {
  return prisma.t_user.findUnique({
    where: { id },
    select: ACCOUNT_DELETION_SELECT,
  });
}
