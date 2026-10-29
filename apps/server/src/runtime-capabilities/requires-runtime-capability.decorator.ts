import { SetMetadata } from '@nestjs/common';
import type { RuntimeCapabilityName } from './runtime-capability.types';

export const RUNTIME_CAPABILITY_METADATA = 'runtime-capability';

export const RequiresRuntimeCapability = (name: RuntimeCapabilityName) =>
  SetMetadata(RUNTIME_CAPABILITY_METADATA, name);
