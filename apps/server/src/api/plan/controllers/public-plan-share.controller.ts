import { Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { PlanShareService } from '../application/plan-share.service';

@Controller('public')
@AllowAnonymous()
@Throttle({ default: { ttl: 60_000, limit: 8 } })
export class PublicPlanShareController {
  constructor(private readonly shares: PlanShareService) {}

  @Get('plan-shares/:publicId')
  getShare(@Param('publicId') publicId: string) {
    return this.shares.getPublicSharePreview(publicId);
  }

  @Get('plan-share-lineages/:publicId')
  getLineage(
    @Param('publicId') publicId: string,
    @Query('version') version?: string,
  ) {
    const parsed =
      version && /^\d+$/.test(version) ? Number(version) : undefined;
    return this.shares.getPublicLineagePreview(publicId, parsed);
  }

  @Get('plan-catalog')
  listCatalog() {
    return this.shares.listCatalog();
  }

  @Get('plan-catalog/:slug')
  getCatalog(@Param('slug') slug: string) {
    return this.shares.getCatalogBySlug(slug);
  }
}
