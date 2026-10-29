import { Controller, Get, Query } from '@nestjs/common';
import { SportCatalogService } from './sport-catalog.service';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';

@Controller('sports')
export class SportCatalogController {
  constructor(private readonly catalog: SportCatalogService) {}

  @Get('catalog')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  catalogList(@Query('planning') planning?: string) {
    return this.catalog.list({ planning: planning === 'true' });
  }
}
