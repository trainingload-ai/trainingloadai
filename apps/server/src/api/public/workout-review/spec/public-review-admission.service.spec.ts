import { describe, expect, it } from '@jest/globals';
import { PublicReviewAdmissionService } from '../public-review-admission.service';

describe('PublicReviewAdmissionService', () => {
  const now = new Date('2026-08-10T08:00:00.000Z');
  const service = new PublicReviewAdmissionService(
    'admission-secret-that-is-long-enough-for-tests',
    300,
  );

  it('issues a short-lived token bound to visitor and IP subjects', () => {
    const issued = service.issue(
      { visitorHash: 'visitor-hash', ipHash: 'ip-hash' },
      now,
    );

    expect(issued.expiresAt).toBe('2026-08-10T08:05:00.000Z');
    expect(
      service.verify(
        issued.token,
        { visitorHash: 'visitor-hash', ipHash: 'ip-hash' },
        new Date('2026-08-10T08:04:59.000Z'),
      ),
    ).toMatchObject({
      nonce: issued.nonce,
      visitorHash: 'visitor-hash',
      ipHash: 'ip-hash',
    });
  });

  it('rejects tampering, expiry and a different request binding', () => {
    const issued = service.issue(
      { visitorHash: 'visitor-hash', ipHash: 'ip-hash' },
      now,
    );

    expect(
      service.verify(
        `${issued.token}x`,
        {
          visitorHash: 'visitor-hash',
          ipHash: 'ip-hash',
        },
        now,
      ),
    ).toBeNull();
    expect(
      service.verify(
        issued.token,
        {
          visitorHash: 'visitor-hash',
          ipHash: 'other-ip',
        },
        now,
      ),
    ).toBeNull();
    expect(
      service.verify(
        issued.token,
        { visitorHash: 'visitor-hash', ipHash: 'ip-hash' },
        new Date('2026-08-10T08:05:01.000Z'),
      ),
    ).toBeNull();
  });
});
