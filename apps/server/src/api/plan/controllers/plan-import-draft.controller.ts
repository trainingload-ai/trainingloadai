import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { OAuthHybridAuthGuard } from '@/oauth/oauth-hybrid-auth.guard';
import { PlanImportDraftService } from '../application/plan-import-draft.service';

@Controller('plan-import-drafts')
@UseGuards(OAuthHybridAuthGuard)
export class PlanImportDraftController {
  constructor(private readonly drafts: PlanImportDraftService) {}

  @Get(':token/preview')
  preview(@Param('token') token: string) {
    return this.drafts.preview(token);
  }

  @Post(':token/import')
  import(@Param('token') token: string, @CurrentUserId() userId: string) {
    return this.drafts.import(userId, token);
  }
}
