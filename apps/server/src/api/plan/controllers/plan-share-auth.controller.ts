import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { OAuthHybridAuthGuard } from '@/oauth/oauth-hybrid-auth.guard';
import { PlanShareService } from '../application/plan-share.service';
import { ImportPlanShareDto } from '../dto/import-plan-share.dto';

@Controller()
@UseGuards(OAuthHybridAuthGuard)
export class PlanShareAuthController {
  constructor(private readonly shares: PlanShareService) {}

  @Get('plan-shares')
  listMine(@CurrentUserId() userId: string) {
    return this.shares.listMine(userId);
  }

  @Get('plan-shares/:publicId/preview')
  previewForViewer(
    @Param('publicId') publicId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.shares.getViewerSharePreview(userId, publicId);
  }

  @Post('plan-shares/:publicId/revoke')
  revokeShare(
    @Param('publicId') publicId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.shares.revokeShare(userId, publicId);
  }

  @Post('plan-shares/:publicId/import')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  importShare(
    @Param('publicId') publicId: string,
    @CurrentUserId() userId: string,
    @Body() dto?: ImportPlanShareDto,
  ) {
    return this.shares.importForUser(userId, publicId, {
      share: Boolean(dto?.share),
    });
  }

  @Post('plan-share-lineages/:publicId/revoke')
  revokeLineage(
    @Param('publicId') publicId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.shares.revokeLineage(userId, publicId);
  }
}
