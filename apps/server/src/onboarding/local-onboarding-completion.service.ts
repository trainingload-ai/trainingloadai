import { Injectable } from '@nestjs/common';

import type { OnboardingCompletion } from './onboarding-completion.port';
import { UserQueryService } from '@/api/user/user-query.service';

@Injectable()
export class LocalOnboardingCompletionService implements OnboardingCompletion {
  constructor(private readonly users: UserQueryService) {}

  async complete(userId: string) {
    await this.users.users().updateMany({
      where: { id: userId, isNewUser: true },
      data: { isNewUser: false },
    });
    return {};
  }
}
