import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { PlanShareService } from '../application/plan-share.service';

@Controller('public')
@AllowAnonymous()
@Throttle({ default: { ttl: 60_000, limit: 8 } })
export class PublicPlanShareController {
  constructor(private readonly shares: PlanShareService) {}

  @Get('plan-catalog')
  listCatalog() {
    return this.shares.listCatalog();
  }

  @Get('plan-catalog/:slug')
  getCatalog(@Param('slug') slug: string) {
    return this.shares.getCatalogBySlug(slug);
  }
}
