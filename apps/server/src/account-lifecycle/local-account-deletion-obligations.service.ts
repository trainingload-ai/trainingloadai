import { Injectable } from '@nestjs/common';
import type {
  AccountDeletionPreparationResult,
  AccountDeletionObligations,
  AccountDeletionObligationPreview,
} from './account-deletion-obligations.port';

@Injectable()
export class LocalAccountDeletionObligationsService implements AccountDeletionObligations {
  async preview(): Promise<AccountDeletionObligationPreview> {
    return {};
  }

  async prepareDeletion(): Promise<AccountDeletionPreparationResult> {
    return {};
  }

  async assertDeletionAllowed(): Promise<void> {}

  async deleteRemoteIdentity(): Promise<void> {}

  async snapshot() {
    return [];
  }
}
