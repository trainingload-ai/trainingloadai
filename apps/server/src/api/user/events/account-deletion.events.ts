export const ACCOUNT_DELETION_REQUESTED_EVENT = 'account.deletion.requested';

export class AccountDeletionRequestedEvent {
  constructor(public readonly userId: string) {}
}
