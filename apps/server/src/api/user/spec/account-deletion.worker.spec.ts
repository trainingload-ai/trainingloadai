import { beforeAll, describe, expect, it, jest } from '@jest/globals';

import { encryptAccountDeletionValue } from '../account-deletion-crypto';
import { AccountDeletionWorker } from '../account-deletion.worker';
import { registerAccountDeletionNotifier } from '../account-deletion-notifier.port';

type CompletionEmailJob = {
  notificationEmailCiphertext: string;
  notificationLocale: string | null;
};

type WorkerWithCompletionEmail = {
  sendCompletionEmail: (job: CompletionEmailJob) => Promise<void>;
};

describe('AccountDeletionWorker completion email', () => {
  beforeAll(() => {
    process.env.ACCOUNT_DELETION_SECRET = 'account-deletion-worker-test';
  });

  function createWorker(mailEnabled = true) {
    const mail = {
      notifyCompletion: jest.fn(async () => undefined),
    };
    const unregister = registerAccountDeletionNotifier(mail);
    const worker = new AccountDeletionWorker(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { isEnabled: jest.fn(() => mailEnabled) } as never,
      { beforeUserDeletion: jest.fn(async () => undefined) } as never,
    );
    return {
      mail,
      unregister,
      worker: worker as unknown as WorkerWithCompletionEmail,
    };
  }

  it('passes the stored locale to the localized completion email', async () => {
    const { mail, unregister, worker } = createWorker();

    await worker.sendCompletionEmail({
      notificationEmailCiphertext:
        encryptAccountDeletionValue('runner@example.com'),
      notificationLocale: 'de',
    });

    expect(mail.notifyCompletion).toHaveBeenCalledWith({
      email: 'runner@example.com',
      locale: 'de',
    });
    unregister();
  });

  it('propagates email failures so the persistent job can retry', async () => {
    const { mail, unregister, worker } = createWorker();
    mail.notifyCompletion.mockRejectedValueOnce(new Error('smtp unavailable'));

    await expect(
      worker.sendCompletionEmail({
        notificationEmailCiphertext:
          encryptAccountDeletionValue('runner@example.com'),
        notificationLocale: 'en',
      }),
    ).rejects.toThrow('smtp unavailable');
    unregister();
  });

  it('completes without attempting email when mail is disabled', async () => {
    const { mail, unregister, worker } = createWorker(false);

    await worker.sendCompletionEmail({
      notificationEmailCiphertext:
        encryptAccountDeletionValue('runner@example.com'),
      notificationLocale: 'en',
    });

    expect(mail.notifyCompletion).not.toHaveBeenCalled();
    unregister();
  });
});
