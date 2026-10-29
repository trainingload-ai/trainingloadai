import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma, type PlanImportDraft } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  generateVdotPlan,
  toCreatePlanDto,
  validateVdotPlanBrief,
  validateVdotPlanDraft,
  type VdotPlanDraftV1,
} from '@shared/vdot-plan';
import { PlanImportDraftRepository } from '../persistence/plan-import-draft.repository';
import { PlanService } from '../plan.service';
import type { CreatePlanDto } from '../dto/create-plan.dto';

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_DRAFT_BYTES = 256 * 1024;

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function assertToken(token: string) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
    throw new NotFoundException('Plan import draft not found');
  }
}

@Injectable()
export class PlanImportDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planService: PlanService,
    private readonly drafts: PlanImportDraftRepository,
  ) {}

  async create(value: unknown) {
    let size = 0;
    try {
      size = Buffer.byteLength(JSON.stringify(value), 'utf8');
    } catch {
      throw new BadRequestException('Plan draft must be valid JSON');
    }
    if (size > MAX_DRAFT_BYTES) {
      throw new BadRequestException('Plan draft is too large');
    }

    let validation;
    try {
      validation = validateVdotPlanDraft(value);
    } catch {
      throw new BadRequestException('Plan draft is invalid');
    }
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Plan draft is invalid',
        issues: validation.errors,
      });
    }

    const input = value as VdotPlanDraftV1;
    let briefValidation;
    try {
      briefValidation = validateVdotPlanBrief(input.brief);
    } catch {
      throw new BadRequestException('Plan brief is invalid');
    }
    if (briefValidation.errors.length > 0) {
      throw new BadRequestException({
        message: 'Plan brief is invalid',
        issues: briefValidation.errors,
      });
    }
    let canonicalDraft: VdotPlanDraftV1;
    try {
      canonicalDraft = generateVdotPlan(input.brief, {
        locale: typeof input.locale === 'string' ? input.locale : 'en',
      });
    } catch {
      throw new BadRequestException('Plan draft could not be regenerated');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);
    const drafts = this.drafts;

    await drafts.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await drafts.create({
      data: {
        tokenHash: tokenHash(token),
        payload: canonicalDraft as Prisma.InputJsonValue,
        expiresAt,
      },
    });

    return { token, expiresAt: expiresAt.toISOString() };
  }

  async preview(token: string) {
    assertToken(token);
    const row = await this.drafts.findUnique({
      where: { tokenHash: tokenHash(token) },
    });
    this.assertAvailable(row);
    const draft = row.payload as VdotPlanDraftV1;
    return {
      draft,
      expiresAt: row.expiresAt.toISOString(),
      summary: {
        title: draft.title,
        goal: draft.goal,
        vdot: draft.brief.vdot,
        periodWeeks: draft.periodWeeks,
        workoutCount: draft.workouts.length,
        startDate: draft.brief.startDate,
        generatedAt: draft.generatedAt,
      },
    };
  }

  async import(userId: string, token: string) {
    assertToken(token);
    const hash = tokenHash(token);
    const drafts = this.drafts;
    const row = await drafts.findUnique({ where: { tokenHash: hash } });
    this.assertAvailable(row);

    const claimedAt = new Date();
    const claimed = await drafts.updateMany({
      where: {
        id: row.id,
        consumedAt: null,
        expiresAt: { gt: claimedAt },
      },
      data: {
        consumedAt: claimedAt,
        consumedByUserId: userId,
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('Plan import draft has already been used');
    }

    try {
      const dto = toCreatePlanDto(row.payload as VdotPlanDraftV1);
      return await this.planService.createPlan(userId, dto as CreatePlanDto);
    } catch (error) {
      await drafts.updateMany({
        where: {
          id: row.id,
          consumedAt: claimedAt,
          consumedByUserId: userId,
        },
        data: {
          consumedAt: null,
          consumedByUserId: null,
        },
      });
      throw error;
    }
  }

  private assertAvailable(
    row: PlanImportDraft | null,
  ): asserts row is PlanImportDraft {
    if (!row) {
      throw new NotFoundException('Plan import draft not found');
    }
    if (row.consumedAt) {
      throw new ConflictException('Plan import draft has already been used');
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('Plan import draft has expired');
    }
  }
}
