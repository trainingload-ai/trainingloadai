import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { readPublicReviewSecret } from './public-review-config';

export const PUBLIC_REVIEW_COOKIE_NAME = '__Host-tl_anon_v1';
const COOKIE_VERSION = 'v1';
const COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
const COOKIE_MAX_AGE_DAYS = 180;

type QuotaSubjectScope = 'VISITOR' | 'IP' | 'ACTIVITY';

function utcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function defaultIdentitySecret(): string {
  return readPublicReviewSecret(
    'PUBLIC_AI_REVIEW_IDENTITY_SECRET',
    'local-public-review-identity-secret-change-me',
  );
}

@Injectable()
export class PublicReviewIdentityService {
  constructor(private readonly secret = defaultIdentitySecret()) {}

  issueVisitor(now = new Date()) {
    const id = randomBytes(16).toString('base64url');
    const issuedAtDay = utcDay(now);
    const unsigned = `${COOKIE_VERSION}.${id}.${issuedAtDay}`;
    const signature = this.sign(unsigned);
    const value = `${unsigned}.${signature}`;
    return {
      id,
      value,
      cookie: `${PUBLIC_REVIEW_COOKIE_NAME}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Secure; HttpOnly; SameSite=Lax`,
      issuedAtDay,
      isNew: true as const,
    };
  }

  verifyVisitor(value: string | undefined, now = new Date()) {
    if (!value) return null;
    const parts = value.split('.');
    if (parts.length !== 4) return null;
    const [version, id, issuedAtDay, signature] = parts;
    if (
      version !== COOKIE_VERSION ||
      !id ||
      !/^\d{4}-\d{2}-\d{2}$/.test(issuedAtDay)
    ) {
      return null;
    }
    const expected = this.sign(`${version}.${id}.${issuedAtDay}`);
    if (!safeEqual(signature, expected)) return null;
    const issued = new Date(`${issuedAtDay}T00:00:00.000Z`);
    const ageDays = (now.getTime() - issued.getTime()) / 86_400_000;
    if (
      !Number.isFinite(ageDays) ||
      ageDays < 0 ||
      ageDays > COOKIE_MAX_AGE_DAYS
    ) {
      return null;
    }
    return { id, issuedAtDay, isNew: false as const };
  }

  rollingSubjectHash(scope: QuotaSubjectScope, subject: string) {
    return createHmac('sha256', this.secret)
      .update(`public-ai-review:rolling-v1:${scope}:${subject}`)
      .digest('base64url');
  }

  private sign(value: string) {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }
}
