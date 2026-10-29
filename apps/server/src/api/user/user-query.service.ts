import { Injectable } from '@nestjs/common';
import { UserIdentityRepository } from './persistence/user-identity.repository';

/**
 * User 表只读/窄写端口。Repository 不 export。
 * T_user_accounts / ExternalProviderConnection 不在这里。
 */
@Injectable()
export class UserQueryService {
  constructor(private readonly identity: UserIdentityRepository) {}

  users(tx?: Parameters<UserIdentityRepository['users']>[0]) {
    return this.identity.users(tx);
  }

  profiles(tx?: Parameters<UserIdentityRepository['profiles']>[0]) {
    return this.identity.profiles(tx);
  }

  settings(tx?: Parameters<UserIdentityRepository['settings']>[0]) {
    return this.identity.settings(tx);
  }

  bodyMetrics(tx?: Parameters<UserIdentityRepository['bodyMetrics']>[0]) {
    return this.identity.bodyMetrics(tx);
  }

  fitnessMetrics(tx?: Parameters<UserIdentityRepository['fitnessMetrics']>[0]) {
    return this.identity.fitnessMetrics(tx);
  }

  zoneSettings(tx?: Parameters<UserIdentityRepository['zoneSettings']>[0]) {
    return this.identity.zoneSettings(tx);
  }

  findUserById(id: string) {
    return this.users().findUnique({
      where: { id },
    });
  }
}
