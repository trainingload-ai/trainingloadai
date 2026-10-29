import { describe, expect, it } from '@jest/globals';
import { UserQueryService } from '../user-query.service';

describe('UserQueryService', () => {
  it('reads T_user through the identity repository', async () => {
    const findUnique = async () => ({ id: 'user-1' });
    const users = new UserQueryService({
      users: () => ({ findUnique }),
    } as never);
    await expect(users.findUserById('user-1')).resolves.toEqual({
      id: 'user-1',
    });
  });
});
