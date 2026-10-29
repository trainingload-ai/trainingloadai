import { Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { PlanTemplateService } from './plan-template.service';

@Controller('public/plan-templates')
@AllowAnonymous()
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class PublicPlanTemplateController {
  constructor(private readonly templates: PlanTemplateService) {}

  @Get()
  list(@Query('goal') goal?: string, @Query('locale') locale?: string) {
    return this.templates.listPublic(locale, goal);
  }

  @Get(':slug')
  get(@Param('slug') slug: string, @Query('locale') locale?: string) {
    return this.templates.getPublic(slug, locale);
  }
}
