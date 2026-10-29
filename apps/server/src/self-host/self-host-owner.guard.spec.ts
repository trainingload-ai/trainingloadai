import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { PrismaService } from '@/prisma/prisma.service';
import { SelfHostOwnerGuard } from './self-host-owner.guard';

function context(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('SelfHostOwnerGuard', () => {
  const originalMode = process.env.SELF_HOST_MODE;

  afterEach(() => {
    if (originalMode === undefined) delete process.env.SELF_HOST_MODE;
    else process.env.SELF_HOST_MODE = originalMode;
  });

  function guard(instance: { state: string; ownerUserId: string } | null) {
    return new SelfHostOwnerGuard({
      selfHostInstance: {
        findUnique: jest.fn(async () => instance),
      },
    } as unknown as PrismaService);
  }

  it('hides the settings endpoint outside self-host deployments', async () => {
    delete process.env.SELF_HOST_MODE;
    await expect(
      guard(null).canActivate(context({ session: { user: { id: 'owner' } } })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires an authenticated owner of a ready instance', async () => {
    process.env.SELF_HOST_MODE = 'core-local';
    await expect(guard(null).canActivate(context({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      guard({ state: 'READY', ownerUserId: 'owner' }).canActivate(
        context({ session: { user: { id: 'member' } } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guard({ state: 'READY', ownerUserId: 'owner' }).canActivate(
        context({ session: { user: { id: 'owner' } } }),
      ),
    ).resolves.toBe(true);
  });
});
