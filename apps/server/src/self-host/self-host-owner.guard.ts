import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

function requestUserId(request: {
  session?: { user?: { id?: unknown } };
  user?: { id?: unknown };
  auth?: { user?: { id?: unknown } };
  request?: { session?: { user?: { id?: unknown } } };
}) {
  const value =
    request.session?.user?.id ??
    request.user?.id ??
    request.auth?.user?.id ??
    request.request?.session?.user?.id;
  return typeof value === 'string' ? value.trim() : '';
}

@Injectable()
export class SelfHostOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!process.env.SELF_HOST_MODE?.trim()) {
      throw new NotFoundException('Self-host settings are not available');
    }
    const userId = requestUserId(context.switchToHttp().getRequest());
    if (!userId) throw new UnauthorizedException('Authentication required');

    const instance = await this.prisma.selfHostInstance.findUnique({
      where: { id: 1 },
      select: { state: true, ownerUserId: true },
    });
    if (instance?.state !== 'READY' || instance.ownerUserId !== userId) {
      throw new ForbiddenException(
        'Only the self-host instance owner can change instance settings',
      );
    }
    return true;
  }
}
