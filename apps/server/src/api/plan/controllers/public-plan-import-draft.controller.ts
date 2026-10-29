import {
  Body,
  Controller,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { CreatePlanImportDraftDto } from '../dto/create-plan-import-draft.dto';
import { PlanImportDraftService } from '../application/plan-import-draft.service';

@Controller('public/plan-import-drafts')
export class PublicPlanImportDraftController {
  constructor(private readonly drafts: PlanImportDraftService) {}

  @Post()
  @AllowAnonymous()
  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  create(@Body() dto: CreatePlanImportDraftDto) {
    return this.drafts.create(dto.draft);
  }
}
