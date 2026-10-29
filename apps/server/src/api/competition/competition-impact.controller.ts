import { Body, Controller, Post } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { resolveSupportedLocale } from '@/utils/locale.util';
import { CompetitionImpactService } from './competition-impact.service';
import { ResolveCompetitionImpactDto } from './dto/resolve-competition-impact.dto';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';

@Controller('competition-impact')
export class CompetitionImpactController {
  constructor(private readonly impactService: CompetitionImpactService) {}

  @Post('resolve')
  resolve(
    @CurrentUserId() userId: string,
    @Body() body: ResolveCompetitionImpactDto,
  ) {
    return this.impactService.resolve({
      userId,
      ...body,
      locale: resolveSupportedLocale(
        body.locale ?? I18nContext.current()?.lang,
      ),
    });
  }

  @Post('current')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PLANS_READ)
  current(
    @CurrentUserId() userId: string,
    @Body() body: ResolveCompetitionImpactDto,
  ) {
    const { forceRefresh: _forceRefresh, ...scope } = body;
    return this.impactService.resolveForContext({
      userId,
      ...scope,
      locale: resolveSupportedLocale(
        body.locale ?? I18nContext.current()?.lang,
      ),
    });
  }
}
