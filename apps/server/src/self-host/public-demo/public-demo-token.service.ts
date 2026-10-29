import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

export type PublicDemoIdentity = {
  kind: 'public-demo';
  subject: 'demo_guest';
  dataOwnerUserId: string;
  datasetVersion: string;
  expiresAt: Date;
};

/** Self-host never accepts a Trainingload.ai public-demo credential. */
@Injectable()
export class PublicDemoTokenService {
  isEnabled() {
    return false;
  }

  async verifyRequest(
    _request: Request,
  ): Promise<PublicDemoIdentity | null> {
    return null;
  }
}
