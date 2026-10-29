export type AccountDeletionCompletion = {
  email: string;
  locale: string;
};

export interface AccountDeletionNotifier {
  notifyCompletion(args: AccountDeletionCompletion): Promise<void>;
}

let deploymentNotifier: AccountDeletionNotifier | undefined;

/** Deployment composition roots may register one optional notification sink. */
export function registerAccountDeletionNotifier(
  notifier: AccountDeletionNotifier,
): () => void {
  if (deploymentNotifier) {
    throw new Error('Account deletion notifier already registered');
  }
  deploymentNotifier = notifier;
  return () => {
    if (deploymentNotifier === notifier) deploymentNotifier = undefined;
  };
}

export function getAccountDeletionNotifier():
  | AccountDeletionNotifier
  | undefined {
  return deploymentNotifier;
}
