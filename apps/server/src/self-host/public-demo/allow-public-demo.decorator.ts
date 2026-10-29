import { SetMetadata } from '@nestjs/common';
import type { PublicDemoCapability } from '@shared/public-demo-policy';

export const PUBLIC_DEMO_ACCESS_METADATA = 'PUBLIC_DEMO_ACCESS';

/**
 * Keeps Core controller metadata type-safe without enabling the Cloud demo
 * identity in a Self-host runtime.
 */
export function AllowPublicDemo(capability: PublicDemoCapability) {
  return SetMetadata(PUBLIC_DEMO_ACCESS_METADATA, capability);
}
