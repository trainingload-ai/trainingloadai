import type { Request } from 'express';

export const PUBLIC_DEMO_RUNTIME = Symbol('PUBLIC_DEMO_RUNTIME');

export type PublicDemoIdentity = {
  kind: 'public-demo';
  subject: 'demo_guest';
  dataOwnerUserId: string;
  datasetVersion: string;
  expiresAt: Date;
};

export interface PublicDemoRuntime {
  /** Return null for ordinary requests. Reject invalid or expired demo credentials. */
  verifyRequest(request: Request): Promise<PublicDemoIdentity | null>;
}
