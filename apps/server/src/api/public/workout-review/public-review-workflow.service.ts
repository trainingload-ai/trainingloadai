import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { decodeTrackFile } from '@/importing/trackswap-file';
import { mapTrackSwapActivityToCanonicalPayload } from '@/importing/source-adapters/trackswap-canonical.mapper';
import {
  buildPublicReviewArtifacts,
  PUBLIC_REVIEW_LANGUAGES,
  type PublicReviewLanguage,
} from './public-review-artifacts';
import {
  PUBLIC_REVIEW_COOKIE_NAME,
  PublicReviewIdentityService,
} from './public-review-identity.service';
import { PublicReviewAdmissionService } from './public-review-admission.service';
import {
  PublicReviewQuotaError,
  PublicReviewQuotaService,
} from './public-review-quota.service';
import { PublicReviewAiService } from './public-review-result';
import { isPublicReviewEnabled } from './public-review-config';

export type PublicReviewForm = {
  language?: string;
  consent?: string;
  question?: string;
  perceivedEffort?: string;
  maxHeartRate?: string;
  lactateThresholdHr?: string;
  ftp?: string;
};

function cookieValue(header: string | undefined, name: string) {
  for (const part of String(header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

function numberField(
  value: string | undefined,
  minimum: number,
  maximum: number,
) {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new BadRequestException({ code: 'INVALID_INPUT' });
  }
  return parsed;
}

function quotaException(error: PublicReviewQuotaError) {
  return new HttpException(
    { code: error.code, nextRecoveryAt: error.nextRecoveryAt },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

@Injectable()
export class PublicReviewWorkflowService {
  constructor(
    private readonly identity: PublicReviewIdentityService,
    private readonly admissions: PublicReviewAdmissionService,
    private readonly quota: PublicReviewQuotaService,
    private readonly ai: PublicReviewAiService,
  ) {}

  async createAdmission(input: {
    cookieHeader?: string;
    ip: string;
    now?: Date;
  }) {
    if (!isPublicReviewEnabled()) {
      return {
        body: {
          status: 'temporarily_unavailable' as const,
          retryAfterSeconds: 3600,
        },
      };
    }
    const now = input.now ?? new Date();
    const existing = this.identity.verifyVisitor(
      cookieValue(input.cookieHeader, PUBLIC_REVIEW_COOKIE_NAME),
      now,
    );
    const visitor = existing ?? this.identity.issueVisitor(now);
    const visitorHash = this.identity.rollingSubjectHash('VISITOR', visitor.id);
    const ipHash = this.identity.rollingSubjectHash('IP', input.ip);
    const decision = await this.quota.checkAdmission({
      visitorHash,
      ipHash,
    });
    if (decision.status !== 'eligible') {
      return {
        body: {
          status: 'limit_reached' as const,
          limitCode: decision.code,
          nextRecoveryAt: decision.nextRecoveryAt,
          sharedBudget: decision.sharedBudget,
          visitorQuota: decision.visitorQuota,
        },
        setCookie: existing
          ? undefined
          : (visitor as ReturnType<PublicReviewIdentityService['issueVisitor']>)
              .cookie,
      };
    }
    const admission = this.admissions.issue({ visitorHash, ipHash }, now);
    return {
      body: {
        status: 'eligible' as const,
        admissionToken: admission.token,
        expiresAt: admission.expiresAt,
        sharedBudget: decision.sharedBudget,
        visitorQuota: decision.visitorQuota,
      },
      setCookie: existing
        ? undefined
        : (visitor as ReturnType<PublicReviewIdentityService['issueVisitor']>)
            .cookie,
    };
  }

  async prepareReview(input: {
    file?: Express.Multer.File;
    form: PublicReviewForm;
    admissionToken?: string;
    cookieHeader?: string;
    ip: string;
    now?: Date;
  }) {
    if (!isPublicReviewEnabled())
      throw new ServiceUnavailableException({ code: 'UNAVAILABLE' });
    if (!input.file?.buffer)
      throw new BadRequestException({ code: 'FILE_REQUIRED' });
    if (input.form.consent !== 'true')
      throw new BadRequestException({ code: 'CONSENT_REQUIRED' });
    if (
      !PUBLIC_REVIEW_LANGUAGES.includes(
        input.form.language as PublicReviewLanguage,
      )
    ) {
      throw new BadRequestException({ code: 'INVALID_LANGUAGE' });
    }
    const now = input.now ?? new Date();
    const visitor = this.identity.verifyVisitor(
      cookieValue(input.cookieHeader, PUBLIC_REVIEW_COOKIE_NAME),
      now,
    );
    if (!visitor)
      throw new UnauthorizedException({ code: 'ADMISSION_INVALID' });
    const visitorHash = this.identity.rollingSubjectHash('VISITOR', visitor.id);
    const ipHash = this.identity.rollingSubjectHash('IP', input.ip);
    const admission = this.admissions.verify(
      input.admissionToken,
      { visitorHash, ipHash },
      now,
    );
    if (!admission)
      throw new UnauthorizedException({ code: 'ADMISSION_INVALID' });

    let decoded;
    try {
      decoded = await decodeTrackFile(input.file.buffer, {
        filename: input.file.originalname,
      });
    } catch {
      throw new BadRequestException({ code: 'FILE_INVALID' });
    }
    const activities = decoded.activity.activities ?? [];
    if (activities.length === 0)
      throw new BadRequestException({ code: 'ACTIVITY_NOT_FOUND' });
    if (activities.length !== 1) {
      throw new BadRequestException({
        code: 'MULTIPLE_ACTIVITIES_UNSUPPORTED',
      });
    }
    const payload = mapTrackSwapActivityToCanonicalPayload({
      kind: 'FILE',
      sourceUid: 'public-ephemeral',
      activity: activities[0],
    });
    const artifacts = buildPublicReviewArtifacts(payload, {
      language: input.form.language as PublicReviewLanguage,
      question: input.form.question,
      perceivedEffort: numberField(input.form.perceivedEffort, 1, 10),
      maxHeartRate: numberField(input.form.maxHeartRate, 60, 260),
      lactateThresholdHr: numberField(input.form.lactateThresholdHr, 60, 240),
      ftp: numberField(input.form.ftp, 20, 2_000),
    });
    const activityHash = this.identity.rollingSubjectHash(
      'ACTIVITY',
      artifacts.datasetChecksum,
    );
    try {
      const reservation = await this.quota.reserve({
        admissionNonce: admission.nonce,
        visitorHash,
        ipHash,
        activityHash,
      });
      return { ...artifacts, reservationId: reservation.reservationId };
    } catch (error) {
      if (error instanceof PublicReviewQuotaError) throw quotaException(error);
      throw error;
    }
  }

  generateReview(
    evidence: Parameters<PublicReviewAiService['generate']>[0],
    signal?: AbortSignal,
    context?: Parameters<PublicReviewAiService['generate']>[2],
  ) {
    return this.ai.generate(evidence, signal, context);
  }

  settle(input: Parameters<PublicReviewQuotaService['settle']>[0]) {
    return this.quota.settle(input);
  }
}
