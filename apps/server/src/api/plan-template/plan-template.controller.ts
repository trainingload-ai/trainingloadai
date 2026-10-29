import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { CreatePlanTemplatePreviewDto } from './dto/create-plan-template-preview.dto';
import { InstantiatePlanTemplateDto } from './dto/instantiate-plan-template.dto';
import { PlanTemplateService } from './plan-template.service';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';

@Controller('plan-templates')
export class PlanTemplateController {
  constructor(private readonly templates: PlanTemplateService) {}

  @Get('recommendation')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PLANS_READ)
  recommend(@CurrentUserId() userId: string, @Query('goal') goal?: string) {
    return this.templates.recommend(userId, goal);
  }

  @Get(':slug')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PLANS_READ)
  get(
    @CurrentUserId() userId: string,
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
    @Query('variantId') variantId?: string,
  ) {
    return this.templates.getPersonalized(userId, slug, locale, variantId);
  }

  @Post(':slug/previews')
  preview(
    @CurrentUserId() userId: string,
    @Param('slug') slug: string,
    @Body() input: CreatePlanTemplatePreviewDto,
  ) {
    return this.templates.createPreview(userId, slug, input);
  }

  @Post(':slug/instantiate')
  instantiate(
    @CurrentUserId() userId: string,
    @Param('slug') slug: string,
    @Body() input: InstantiatePlanTemplateDto,
  ) {
    return this.templates.instantiate(userId, slug, input.previewToken);
  }
}
