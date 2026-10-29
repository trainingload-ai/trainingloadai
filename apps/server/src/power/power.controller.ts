import { Controller, Get, Query } from '@nestjs/common';
import { powerService } from './power.service';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { SportType } from '@prisma/client';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';
import {
  CurrentPublicDemo,
  type PublicDemoRequestContext,
} from '@/public-demo/current-public-demo.decorator';

@Controller('power')
export class PowerController {
  constructor(private readonly powerService: powerService) {}

  /**
   * Get the power zone settings
   * Returns zones and benchmark (FTP/CP)
   * GET
   *
   * Query parameters:
   * - type: 'POWER', defaults to 'POWER'
   */
  @Get('zones')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getPowerZones(
    @Query('activityId') activityId?: string,
    @Query('sportType') sportType?: SportType,
    @CurrentUserId() userId?: string,
    @CurrentPublicDemo() publicDemo?: PublicDemoRequestContext | null,
  ) {
    const result = await this.powerService.getPowerZones(activityId, {
      userId,
      sportType: sportType,
      readOnly: Boolean(publicDemo),
    });

    // A successful query must still carry a concrete payload when the
    // activity has no power samples. This also keeps TanStack Query clients
    // from treating an undefined envelope data field as an invalid result.
    return result ?? { zones: [] };
  }
}
