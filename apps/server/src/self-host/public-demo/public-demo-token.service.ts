import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import type {
  PublicDemoIdentity,
  PublicDemoRuntime,
} from '../../public-demo/public-demo-runtime.port';
export type { PublicDemoIdentity } from '../../public-demo/public-demo-runtime.port';

/** Self-host never accepts a Trainingload.ai public-demo credential. */
@Injectable()
export class PublicDemoTokenService implements PublicDemoRuntime {
  isEnabled() {
    return false;
  }

  async verifyRequest(
    _request: Request,
  ): Promise<PublicDemoIdentity | null> {
    return null;
  }
}
