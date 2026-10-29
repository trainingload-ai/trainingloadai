import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { readPublicReviewSecret } from './public-review-config';

type AdmissionBinding = {
  visitorHash: string;
  ipHash: string;
};

export type PublicReviewAdmissionPayload = AdmissionBinding & {
  version: 2;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
};

function defaultAdmissionSecret(): string {
  return readPublicReviewSecret(
    'PUBLIC_AI_REVIEW_ADMISSION_SECRET',
    'local-public-review-admission-secret-change-me',
  );
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class PublicReviewAdmissionService {
  constructor(
    private readonly secret = defaultAdmissionSecret(),
    private readonly ttlSeconds = 300,
  ) {}

  issue(binding: AdmissionBinding, now = new Date()) {
    const payload: PublicReviewAdmissionPayload = {
      version: 2,
      nonce: randomBytes(18).toString('base64url'),
      issuedAt: Math.floor(now.getTime() / 1000),
      expiresAt: Math.floor(now.getTime() / 1000) + this.ttlSeconds,
      ...binding,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `${body}.${this.sign(body)}`;
    return {
      token,
      nonce: payload.nonce,
      expiresAt: new Date(payload.expiresAt * 1000).toISOString(),
    };
  }

  verify(
    token: string | undefined,
    binding: AdmissionBinding,
    now = new Date(),
  ) {
    if (!token) return null;
    const [body, signature, extra] = token.split('.');
    if (
      !body ||
      !signature ||
      extra ||
      !safeEqual(signature, this.sign(body))
    ) {
      return null;
    }
    try {
      const payload = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as PublicReviewAdmissionPayload;
      const nowSeconds = Math.floor(now.getTime() / 1000);
      if (
        payload.version !== 2 ||
        typeof payload.nonce !== 'string' ||
        !payload.nonce ||
        payload.expiresAt < nowSeconds ||
        payload.issuedAt > nowSeconds + 30 ||
        payload.visitorHash !== binding.visitorHash ||
        payload.ipHash !== binding.ipHash
      ) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  private sign(value: string) {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }
}
