import { createParamDecorator } from '@nestjs/common';
import type { PublicDemoCapability } from '@shared/public-demo-policy';
import type { PublicDemoIdentity } from './public-demo-token.service';

export type PublicDemoRequestContext = PublicDemoIdentity & {
  capability: PublicDemoCapability;
};

/** A Self-host request can never carry the Cloud public-demo identity. */
export const CurrentPublicDemo = createParamDecorator(
  (): PublicDemoRequestContext | null => null,
);
