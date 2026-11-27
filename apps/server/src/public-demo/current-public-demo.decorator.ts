import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PublicDemoCapability } from '@shared/public-demo-policy';
import type { PublicDemoIdentity } from './public-demo-runtime.port';

export type PublicDemoRequestContext = PublicDemoIdentity & {
  capability: PublicDemoCapability;
};

/** The guard populates the context only after the runtime verifies the credential. */
export const CurrentPublicDemo = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicDemoRequestContext | null =>
    context.switchToHttp().getRequest<{ publicDemo?: PublicDemoRequestContext }>().publicDemo ?? null,
);
