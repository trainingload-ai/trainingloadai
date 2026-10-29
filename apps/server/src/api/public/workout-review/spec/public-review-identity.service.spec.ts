import { describe, expect, it } from '@jest/globals';
import { PublicReviewIdentityService } from '../public-review-identity.service';

describe('PublicReviewIdentityService', () => {
  const secret = 'identity-secret-that-is-long-enough-for-tests';
  const now = new Date('2026-08-10T08:00:00.000Z');
  const service = new PublicReviewIdentityService(secret);

  it('issues and verifies an opaque signed visitor cookie', () => {
    const issued = service.issueVisitor(now);
    const verified = service.verifyVisitor(issued.value, now);

    expect(issued.value).toMatch(
      /^v1\.[A-Za-z0-9_-]+\.\d{4}-\d{2}-\d{2}\.[A-Za-z0-9_-]+$/,
    );
    expect(verified).toEqual({
      id: issued.id,
      issuedAtDay: '2026-08-10',
      isNew: false,
    });
    expect(issued.cookie).toContain('__Host-tl_anon_v1=');
    expect(issued.cookie).toContain('HttpOnly');
    expect(issued.cookie).toContain('Secure');
    expect(issued.cookie).toContain('SameSite=Lax');
    expect(issued.cookie).not.toContain('Domain=');
  });

  it('rejects tampering, unsupported versions and expired cookies', () => {
    const issued = service.issueVisitor(now);
    const tampered = `${issued.value.slice(0, -1)}x`;

    expect(service.verifyVisitor(tampered, now)).toBeNull();
    expect(
      service.verifyVisitor(issued.value.replace(/^v1/, 'v2'), now),
    ).toBeNull();
    expect(
      service.verifyVisitor(issued.value, new Date('2027-02-08T08:00:01.000Z')),
    ).toBeNull();
  });

  it('creates stable, scope-separated pseudonyms for a rolling window', () => {
    const visitor = service.rollingSubjectHash('VISITOR', 'visitor-1');
    const ip = service.rollingSubjectHash('IP', 'visitor-1');
    const activity = service.rollingSubjectHash('ACTIVITY', 'visitor-1');

    expect(new Set([visitor, ip, activity]).size).toBe(3);
    expect(visitor).toBe(service.rollingSubjectHash('VISITOR', 'visitor-1'));
  });
});
